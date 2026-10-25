"""Generate/validate the skill resource index; paths are repo-relative."""
import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / '.skill/manifest.json'


def tokens(paths):
    text = '\n'.join((ROOT / name).read_text(encoding='utf-8-sig') for name in paths)
    non_ascii = sum(ord(char) > 127 for char in text)
    return math.ceil(non_ascii + (len(text) - non_ascii) / 4)


def relative(paths):
    return sorted(p.relative_to(ROOT).as_posix() for p in paths if p.is_file())


def component(name, kind, files):
    return {'name': name, 'type': kind, 'source_files': files,
            'estimated_tokens': tokens(files), 'load_condition': 'on_demand'}


def make_index():
    runtime = lambda directory: relative(p for p in directory.iterdir()
        if p.suffix in {'.js', '.mjs', '.html', '.css', '.json'} and not p.name.endswith('.test.mjs'))
    components = [
        component('one-click', 'chrome-mv3', runtime(ROOT)),
        component('gather-helper', 'chrome-mv3', runtime(ROOT / 'chrome-extension')),
        component('research', 'python-offline', relative((ROOT / 'research').glob('*.py'))),
        component('build-tools', 'node-python', relative((ROOT / 'tools').glob('*'))),
        component('project-docs', 'documentation', ['AGENTS.md', 'README.md', 'chrome-extension/README.md', '.gitignore', '.graphifyignore']),
        component('graph', 'graphify-evidence', ['graphify-out/graph.json', 'graphify-out/GRAPH_REPORT.md']),
    ]
    counts = {'hotkey.test.mjs': 1, 'one-click.test.mjs': 6, 'native.test.mjs': 10,
              'chrome-extension/core.test.mjs': 9, 'chrome-extension/observer.test.mjs': 9,
              'chrome-extension/native.test.mjs': 10}
    tests = [{'name': path, 'path': path, 'type': 'node:test', 'test_count': count,
              'estimated_tokens': tokens([path]), 'load_condition': 'on_demand'}
             for path, count in counts.items()]
    files = []
    for name in relative(p for p in (ROOT / '.skill').rglob('*')
                         if p != INDEX and '__pycache__' not in p.parts and p.suffix != '.pyc'):
        files.append({'path': name, 'estimated_tokens': tokens([name]),
                      'load_condition': 'always' if name == '.skill/SKILL.md' else 'on_demand'})
    return {
        'skill_name': 'deploy-assisst-developer', 'version': '1.0.0', 'path_base': 'repo-root',
        'token_estimation': 'non-ASCII characters + ceil(ASCII characters / 4); approximate, not tokenizer billing',
        'consumer': '.skill/scripts/resources.py',
        'components': components, 'test_files': tests, 'skill_files': files,
        'total_estimated_tokens': sum(item['estimated_tokens'] for item in components + tests + files),
        'always_load_estimated_tokens': sum(item['estimated_tokens'] for item in files if item['load_condition'] == 'always'),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    expected = make_index()
    if args.write:
        INDEX.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    actual = json.loads(INDEX.read_text(encoding='utf-8'))
    if actual != expected:
        raise SystemExit('Resource index is stale. Run python .skill/scripts/resources.py --write')
    print(f"Resource index OK: {len(actual['skill_files'])} skill files; always-load estimate {actual['always_load_estimated_tokens']} tokens")


if __name__ == '__main__':
    main()
