"""Push this folder to an Apps Script project only if nobody changed the project since our last push.

Several people edit the same Apps Script project (in the browser editor or with clasp). A plain
`clasp push --force` would silently overwrite their work, so this script:
  1. pulls the project as it is now on Google into a temporary folder,
  2. compares it with the snapshot saved at our last push (.clasp-snapshots/<scriptId>/),
  3. stops and lists the changed files if they differ (pull and merge their work first),
  4. otherwise pushes, pulls again to verify, and saves the new snapshot.

Usage (from the project folder):
  python -I tools/safe_push.py <scriptId>            # normal push
  python -I tools/safe_push.py <scriptId> --init     # first time: accept the project as it is now
"""
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SNAPSHOTS = ROOT / '.clasp-snapshots'
SOURCE_SUFFIXES = {'.gs': '.gs', '.js': '.gs', '.html': '.html', '.json': '.json'}


def clasp(args, cwd):
    result = subprocess.run('clasp ' + args, cwd=cwd, shell=True, capture_output=True, text=True, encoding='utf-8')
    if result.returncode != 0:
        sys.exit('clasp ' + args + ' failed:\n' + result.stdout + result.stderr)
    return result.stdout


def read_files(folder):
    """Source files keyed by their name in this repo (clasp pulls .gs files as .js)."""
    files = {}
    for path in pathlib.Path(folder).iterdir():
        suffix = SOURCE_SUFFIXES.get(path.suffix)
        if not path.is_file() or not suffix or path.name == '.clasp.json':
            continue
        files[path.stem + suffix] = path.read_bytes().decode('utf-8').replace('\r\n', '\n')
    return files


def pull(script_id):
    folder = pathlib.Path(tempfile.mkdtemp(prefix='clasp-pull-'))
    (folder / '.clasp.json').write_text(json.dumps({'scriptId': script_id, 'rootDir': ''}), encoding='utf-8')
    clasp('pull', folder)
    return folder


def changed(a, b):
    return sorted(name for name in set(a) | set(b) if a.get(name) != b.get(name))


def save_snapshot(script_id, files):
    folder = SNAPSHOTS / script_id
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir(parents=True)
    for name, text in files.items():
        (folder / name).write_bytes(text.encode('utf-8'))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    script_id, init = sys.argv[1], '--init' in sys.argv[2:]
    remote = read_files(pull(script_id))
    snapshot_folder = SNAPSHOTS / script_id
    if init:
        save_snapshot(script_id, remote)
        print('Saved the project as it is now as the baseline (%d files).' % len(remote))
        return
    if not snapshot_folder.exists():
        sys.exit('No snapshot for %s yet. Check the project, then run with --init.' % script_id)
    others = changed(read_files(snapshot_folder), remote)
    if others:
        sys.exit('STOP: someone changed these files on Google since our last push:\n  ' + '\n  '.join(others) +
                 '\nPull them, merge their work into this folder, then run --init and push again.')

    config = pathlib.Path(tempfile.mkdtemp(prefix='clasp-push-')) / '.clasp.json'
    config.write_text(json.dumps({'scriptId': script_id, 'rootDir': str(ROOT), 'scriptExtensions': ['.js', '.gs'],
                                  'htmlExtensions': ['.html'], 'jsonExtensions': ['.json'], 'filePushOrder': [],
                                  'skipSubdirectories': False}), encoding='utf-8')
    clasp('-P "%s" -I .claspignore push --force' % config, ROOT)

    pushed = read_files(pull(script_id))
    local = {name: text for name, text in read_files(ROOT).items() if name in pushed or name.endswith(('.gs', '.html'))}
    local['appsscript.json'] = read_files(ROOT)['appsscript.json']
    mismatch = changed(local, pushed)
    if mismatch:
        sys.exit('Pushed, but the project on Google differs from this folder:\n  ' + '\n  '.join(mismatch))
    save_snapshot(script_id, pushed)
    print('Pushed %d files to %s and saved the snapshot.' % (len(pushed), script_id))


if __name__ == '__main__':
    main()
