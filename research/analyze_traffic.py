"""Offline, read-only wire analysis using captured frames and local ProtoMember metadata."""
import argparse
import base64
import collections
from datetime import datetime
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def schemas(path):
    text = path.read_text(encoding='utf-8-sig')
    result = {}
    classes = re.finditer(r'^public (?:sealed )?class (\w+) : IExtensible[^\n]*\n\{(.*?)^\}', text, re.M | re.S)
    for match in classes:
        fields = {}
        for field in re.finditer(r'\[ProtoMember\((\d+),[^\n]*\)\]\s*(?:\[[^\n]*\]\s*)*public ([^\n]+?) (\w+) \{', match[2]):
            fields[int(field[1])] = {'type': field[2], 'name': field[3]}
        result[match[1]] = fields
    return result


def varint(data, pos):
    value = 0
    for shift in range(0, 70, 7):
        if pos >= len(data):
            raise ValueError('truncated varint')
        byte = data[pos]
        pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
    raise ValueError('oversized varint')


def fields(data):
    pos = 0
    while pos < len(data):
        key, pos = varint(data, pos)
        number, wire = key >> 3, key & 7
        if not number:
            raise ValueError('invalid field zero')
        if wire == 0:
            value, pos = varint(data, pos)
        elif wire in (1, 2, 5):
            if wire == 2:
                size, pos = varint(data, pos)
            else:
                size = 8 if wire == 1 else 4
            if pos + size > len(data):
                raise ValueError('truncated field')
            value = data[pos:pos + size]
            pos += size
        else:
            raise ValueError(f'unsupported wire type {wire}')
        yield number, wire, value


def decode(data, schema, registry, depth=0):
    if depth > 16:
        raise ValueError('depth limit')
    result = {}
    for number, wire, value in fields(data):
        spec = registry.get(schema, {}).get(number, {'type': 'unknown', 'name': f'field_{number}'})
        typ = spec['type']
        repeated = typ.startswith('List<')
        if repeated:
            typ = typ[5:-1]
        if isinstance(value, bytes):
            if typ == 'string':
                value = value.decode('utf-8', 'replace')
            elif wire == 2 and typ in registry:
                value = decode(value, typ, registry, depth + 1)
            else:
                value = {'bytes': len(value), 'hex': value.hex()}
        elif typ in ('int', 'long') and value >= (1 << 63):
            value -= 1 << 64
        elif typ == 'bool':
            value = bool(value)
        name = spec['name']
        if repeated:
            result.setdefault(name, []).append(value)
        elif name in result:
            result[name] = result[name] + [value] if isinstance(result[name], list) else [result[name], value]
        else:
            result[name] = value
    return result


def lz4_block(data, expected):
    if expected > 4 * 1024 * 1024:
        raise ValueError('decompressed size limit')
    out = bytearray()
    pos = 0
    while pos < len(data):
        token = data[pos]
        pos += 1
        literal = token >> 4
        if literal == 15:
            while True:
                extension = data[pos]
                pos += 1
                literal += extension
                if extension != 255:
                    break
        if pos + literal > len(data):
            raise ValueError('truncated LZ4 literal')
        out.extend(data[pos:pos + literal])
        pos += literal
        if pos == len(data):
            break
        offset = int.from_bytes(data[pos:pos + 2], 'little')
        pos += 2
        if offset <= 0 or offset > len(out):
            raise ValueError('invalid LZ4 offset')
        length = (token & 15) + 4
        if (token & 15) == 15:
            while True:
                extension = data[pos]
                pos += 1
                length += extension
                if extension != 255:
                    break
        if len(out) + length > expected:
            raise ValueError('LZ4 output exceeds declared size')
        for _ in range(length):
            out.append(out[-offset])
    if len(out) != expected:
        raise ValueError('LZ4 size mismatch')
    return bytes(out)


def analyze(recording, registry):
    rows = []
    for event in recording['events']:
        if event['kind'] not in ('ws_send', 'ws_receive'):
            continue
        p = event['payload']
        row = {k: event.get(k) for k in ('seq', 'elapsedMs', 'stage', 'kind')}
        if p.get('omitted') or p.get('truncated') or p.get('encoding') != 'base64':
            row['error'] = 'missing/truncated/nonbinary payload'
            rows.append(row)
            continue
        raw = base64.b64decode(p['data'], validate=True)
        row['frameBytes'] = len(raw)
        if event['kind'] == 'ws_send':
            row.update({'declaredBytes': int.from_bytes(raw[:4], 'big'), 'blockAlignedAfterPrefix': (len(raw) - 4) % 16 == 0})
            rows.append(row)
            continue
        try:
            if len(raw) < 13:
                raise ValueError('short frame')
            payload_size = int.from_bytes(raw[:4], 'big')
            message_id = int.from_bytes(raw[4:8], 'big')
            decompressed_size = int.from_bytes(raw[8:12], 'big')
            envelope_index = raw[12]
            if payload_size != len(raw) - 13:
                raise ValueError('header length mismatch')
            body = lz4_block(raw[13:], decompressed_size) if decompressed_size else raw[13:]
            envelope = 'SCMessage' + (f'_{envelope_index}' if envelope_index else '')
            parsed = list(fields(body))
            if len(parsed) != 1 or parsed[0][0] != message_id or parsed[0][1] != 2:
                raise ValueError('envelope field does not match header ID')
            spec = registry.get(envelope, {}).get(message_id)
            row.update({'messageId': message_id, 'envelope': envelope, 'compressed': bool(decompressed_size), 'bodyBytes': len(body)})
            if spec:
                row['messageType'] = spec['type']
                row['messageName'] = spec['name']
                row['decoded'] = decode(parsed[0][2], spec['type'], registry)
            else:
                row['error'] = 'message ID absent from local metadata'
        except (ValueError, IndexError) as exc:
            row['error'] = str(exc)
        rows.append(row)
    duration = (datetime.fromisoformat(recording['endedAt'].replace('Z', '+00:00')) - datetime.fromisoformat(recording['startedAt'].replace('Z', '+00:00'))).total_seconds() * 1000
    return {'source': recording['startedAt'], 'durationMs': round(duration), 'lastEventElapsedMs': max(e['elapsedMs'] for e in recording['events']),
            'markers': [e for e in recording['events'] if e['kind'] == 'marker'], 'messages': rows}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('recording', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'research/capture/traffic-analysis.json')
    args = parser.parse_args()
    registry = schemas(ROOT / 'research/tools/Il2CppDumper-self/dump.cs')
    recording = json.loads(args.recording.read_text(encoding='utf-8-sig'))
    result = analyze(recording, registry)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print('schemas', len(registry), 'received decoded', sum('decoded' in m for m in result['messages']))
    for m in result['messages']:
        if m['kind'] == 'ws_receive':
            print(m['seq'], m['elapsedMs'], m.get('messageId'), m.get('messageType'), m.get('error', 'OK'))
    print('Saved offline analysis:', args.output)


if __name__ == '__main__':
    main()
