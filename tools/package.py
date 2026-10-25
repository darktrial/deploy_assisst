"""Build extension ZIPs using explicit runtime allowlists, never research data."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
COMMON = ['manifest.json', 'background.js', 'native-client.mjs', 'native-page.mjs',
          'native-profile.json', 'native-runner.mjs', 'README.md']
TARGETS = [
    (ROOT, 'gt-one-click.zip', COMMON + ['hotkey.js', 'one-click.mjs', 'status.html', 'status.js']),
    (ROOT / 'chrome-extension', 'gt-gather-helper.zip', COMMON + [
        'controller.html', 'controller.js', 'core.mjs', 'observer.mjs',
        'starter-profile.json', 'style.css']),
]


def main():
    destination = ROOT / 'dist'
    destination.mkdir(exist_ok=True)
    for source, archive, files in TARGETS:
        for name in files:
            if not (source / name).is_file():
                raise FileNotFoundError(source / name)
        manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
        output = destination / archive
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as package:
            for name in files:
                package.write(source / name, name)
        with zipfile.ZipFile(output) as package:
            assert package.testzip() is None
            assert set(package.namelist()) == set(files)
        print(f'{archive}: version {manifest["version"]}, {len(files)} files')


if __name__ == '__main__':
    main()
