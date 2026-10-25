import sys
from pathlib import Path

from environment import load_local_dependencies
load_local_dependencies()
import UnityPy


for bundle in Path(sys.argv[1]).iterdir():
    if not bundle.is_file():
        continue
    try:
        env = UnityPy.load(str(bundle))
    except Exception as exc:
        print(bundle.name, "ERROR", exc)
        continue
    counts = {}
    names = []
    for obj in env.objects:
        typ = obj.type.name
        counts[typ] = counts.get(typ, 0) + 1
        if typ in {"TextAsset", "MonoBehaviour"}:
            try:
                data = obj.read()
                name = getattr(data, "m_Name", "")
                names.append((typ, name, obj.path_id))
            except Exception:
                pass
    print(bundle.name, counts)
    for row in names:
        print(" ", row)
