import sys
from pathlib import Path

from environment import load_local_dependencies
load_local_dependencies()
import UnityPy


def read_varint(data: bytes, pos: int):
    value = 0
    shift = 0
    while True:
        byte = data[pos]
        pos += 1
        value |= (byte & 0x7F) << shift
        if byte < 0x80:
            return value, pos
        shift += 7


def fields(data: bytes):
    pos = 0
    while pos < len(data):
        key, pos = read_varint(data, pos)
        number, wire = key >> 3, key & 7
        if wire == 0:
            value, pos = read_varint(data, pos)
        elif wire == 2:
            size, pos = read_varint(data, pos)
            value = data[pos : pos + size]
            pos += size
        elif wire == 5:
            value = data[pos : pos + 4]
            pos += 4
        elif wire == 1:
            value = data[pos : pos + 8]
            pos += 8
        else:
            return
        yield number, wire, value


def table_rows(script: bytes):
    index_size = int.from_bytes(script[4:8], "big")
    offsets = []
    for number, wire, value in fields(script[8 : 8 + index_size]):
        if number != 1 or wire != 2:
            continue
        entry = {field: item for field, item_wire, item in fields(value) if item_wire == 0}
        offsets.append((entry[1], entry[2]))
    payload = script[8 + index_size :]
    for pos, (row_id, offset) in enumerate(offsets):
        end = offsets[pos + 1][1] if pos + 1 < len(offsets) else len(payload)
        yield row_id, payload[offset:end]


def main(bundle_path: str):
    env = UnityPy.load(bundle_path)
    script = None
    item_scripts = []
    for obj in env.objects:
        if obj.type.name == "TextAsset":
            asset = obj.read()
            if asset.m_Name == "buff":
                script = asset.m_Script.encode("utf-8", "surrogateescape")
            elif asset.m_Name.startswith("item") and asset.m_Name[4:].isdigit():
                item_scripts.append((asset.m_Name, asset.m_Script.encode("utf-8", "surrogateescape")))
    if script is None:
        raise RuntimeError("buff TextAsset not found")

    rows = []
    for row_id, value in table_rows(script):
        row = {}
        effects = []
        for field, field_wire, field_value in fields(value):
            if field_wire == 0:
                row[field] = field_value
            elif field == 11:
                effects.append({f: v for f, w, v in fields(field_value) if w == 0})
        row[11] = effects
        row.setdefault(1, row_id)
        rows.append(row)

    active_ids = {2025, 2027, 2215, 10021}
    print("ACTIVE CONFIG ROWS")
    for row in rows:
        if row.get(1) in active_ids:
            print(row)
    print("\nCOMMON SHIELD-DURATION CANDIDATES")
    for row in rows:
        if row.get(8) in {3600, 14400, 28800, 86400, 259200, 604800, 2592000}:
            print(row)

    print("\nITEMS WHOSE TEXT MENTIONS SHIELD/TRUCE/PEACE")
    candidate_items = []
    for asset_name, item_script in item_scripts:
        for row_id, value in table_rows(item_script):
            row = {}
            for field, field_wire, field_value in fields(value):
                if field_wire == 0:
                    row[field] = field_value
                elif field_wire == 2 and field in {6, 24, 36}:
                    row[field] = field_value.decode("utf-8", "replace")
                elif field_wire == 2 and field in {19, 20}:
                    row[field] = {f: v for f, w, v in fields(field_value) if w == 0}
            row.setdefault(1, row_id)
            text = " ".join(str(v) for v in row.values()).lower()
            if any(term in text for term in ("shield", "truce", "peace")):
                print(asset_name, row)
            vectors = [row.get(19, {}), row.get(20, {})]
            values = {v for vector in vectors for v in vector.values()}
            if any(1900 <= v <= 2100 for v in values) or values.intersection({3600, 14400, 28800, 86400, 259200, 604800}):
                candidate_items.append((asset_name, row))
    print("\nITEM EFFECT CANDIDATES")
    for item in candidate_items:
        print(*item)


if __name__ == "__main__":
    main(sys.argv[1])
