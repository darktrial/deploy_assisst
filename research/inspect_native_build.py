"""Inspect a Unity wasm function table and direct calls, without executing the game."""
import json
from pathlib import Path


def uint(data, pos):
    value = shift = 0
    while True:
        byte = data[pos]
        pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
        shift += 7


def instructions(body):
    groups, pos = uint(body, 0)
    for _ in range(groups):
        _, pos = uint(body, pos)
        pos += 1
    while pos < len(body):
        offset = pos
        op = body[pos]
        pos += 1
        operands = []
        if op in (2, 3, 4, 12, 13, 16, 32, 33, 34, 35, 36, 63, 64, 65, 66, 210):
            value, pos = uint(body, pos)
            operands.append(value)
        elif op in (17,):
            for _ in range(2):
                value, pos = uint(body, pos)
                operands.append(value)
        elif 40 <= op <= 62:
            for _ in range(2):
                value, pos = uint(body, pos)
                operands.append(value)
        elif op == 14:
            count, pos = uint(body, pos)
            for _ in range(count + 1):
                value, pos = uint(body, pos)
                operands.append(value)
        elif op in (67, 68):
            size = 4 if op == 67 else 8
            operands.append(body[pos:pos+size].hex())
            pos += size
        elif op == 208:
            operands.append(body[pos])
            pos += 1
        elif op in (252, 253, 254):
            raise ValueError(f'unsupported prefixed instruction {op:#x}')
        elif op == 28:
            count, pos = uint(body, pos)
            pos += count
        yield offset, op, operands


class Wasm:
    def __init__(self, path):
        data = path.read_bytes()
        assert data[:8] == b'\0asm\1\0\0\0'
        sections = {}
        pos = 8
        while pos < len(data):
            section = data[pos]
            size, start = uint(data, pos + 1)
            sections[section] = (start, size)
            pos = start + size
        pos = sections[2][0]
        imports, pos = uint(data, pos)
        self.imports = []
        for _ in range(imports):
            parts = []
            for _ in range(2):
                size, pos = uint(data, pos)
                parts.append(data[pos:pos+size].decode())
                pos += size
            kind = data[pos]
            pos += 1
            assert kind == 0, 'non-function import needs an explicit parser'
            _, pos = uint(data, pos)
            self.imports.append('.'.join(parts))
        pos = sections[9][0]
        segments, pos = uint(data, pos)
        assert segments == 1
        flag, pos = uint(data, pos)
        assert flag == 0 and data[pos] == 65
        start, pos = uint(data, pos + 1)
        assert data[pos] == 11
        count, pos = uint(data, pos + 1)
        self.table = [None] * start
        for _ in range(count):
            function, pos = uint(data, pos)
            self.table.append(function)
        count, pos = uint(data, sections[10][0])
        self.bodies = []
        for _ in range(count):
            size, pos = uint(data, pos)
            self.bodies.append((pos, size))
            pos += size
        self.data = data

    def body(self, slot):
        function = self.table[slot]
        pos, size = self.bodies[function - len(self.imports)]
        return self.data[pos:pos+size]


def main():
    root = Path(__file__).resolve().parent / 'capture/build-2.81.0'
    module = Wasm(root / 'client.wasm')
    script = json.loads((root / 'dump/script.json').read_text())
    names = {}
    for row in script['ScriptMethod']:
        if row['Address'] < len(module.table):
            names.setdefault(module.table[row['Address']], []).append(row['Name'])
    targets = [111638, 111639, 111640, 111655, 111659, 111666, 47986]
    report = []
    for slot in targets:
        print('\nSLOT', slot, names.get(module.table[slot], [])[:2])
        calls = []
        for offset, op, operands in instructions(module.body(slot)):
            if op == 16:
                function = operands[0]
                name = names.get(function, [module.imports[function] if function < len(module.imports) else f'function_{function}'])[:3]
                calls.append({'offset': offset, 'function': function, 'names': name})
                print('CALL', offset, name)
        report.append({'slot': slot, 'names': names.get(module.table[slot]), 'calls': calls})
    (root / 'native-call-graph.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
