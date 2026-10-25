import struct
import sys
from pathlib import Path


def main(source: str, out_dir: str) -> None:
    data = Path(source).read_bytes()
    if not data.startswith(b"UnityWebData1.0\0"):
        raise ValueError("Not a UnityWebData archive")
    header_size = struct.unpack_from("<I", data, 16)[0]
    pos = 20
    root = Path(out_dir)
    while pos < header_size:
        offset, size, name_size = struct.unpack_from("<III", data, pos)
        pos += 12
        name = data[pos : pos + name_size].decode("utf-8")
        pos += name_size
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data[offset : offset + size])
        print(f"{name}\t{size}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
