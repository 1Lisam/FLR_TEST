#!/usr/bin/env python3
import argparse, hashlib, json, os, pathlib, re, shutil, subprocess, sys

SAFE_PATH = re.compile(r'^[A-Za-z0-9._/\-]+$')
SAFE_REF = re.compile(r'^[A-Za-z0-9._/\-]+$')

def die(msg):
    raise RuntimeError(msg)

def safe_rel(v, label):
    v = str(v or '')
    if not v or v.startswith('/') or '..' in pathlib.PurePosixPath(v).parts or not SAFE_PATH.fullmatch(v):
        die(f'unsafe {label}: {v!r}')
    return v

def run(cmd, cwd=None, check=True, input_text=None):
    p = subprocess.run(cmd, cwd=cwd, text=True, input=input_text, capture_output=True)
    if check and p.returncode != 0:
        die(f'command failed ({p.returncode}): {cmd}\nSTDOUT:\n{p.stdout[-12000:]}\nSTDERR:\n{p.stderr[-12000:]}')
    return p

def parse_json_text(text, label):
    try:
        return json.loads(text)
    except Exception as e:
        return {'parseError': f'{label}: {e}', 'raw': text[-12000:]}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', required=True)
    ap.add_argument('--candidate', required=True)
    ap.add_argument('--baseline', required=True)
    ap.add_argument('--work', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    cfg = json.loads(pathlib.Path(a.config).read_text(encoding='utf-8'))
    version = str(cfg.get('version') or '')
    branch = str(cfg.get('candidateBranch') or '')
    base_ref = str(cfg.get('baselineRef') or 'main')
    if not version or not SAFE_REF.fullmatch(branch) or not SAFE_REF.fullmatch(base_ref):
        die('invalid version/branch/baseRef')
    apply_scripts = [safe_rel(x, 'applyScripts') for x in cfg.get('applyScripts', [])]
    validation_script = safe_rel(cfg.get('validationScript'), 'validationScript')
    baseline_script = cfg.get('baselineScript')
    if baseline_script:
        baseline_script = safe_rel(baseline_script, 'baselineScript')
    changed_files = [safe_rel(x, 'changedFiles') for x in cfg.get('changedFiles', [])]
    if not changed_files:
        die('changedFiles must not be empty')
    syntax_checks = cfg.get('syntaxChecks', [])

    candidate = pathlib.Path(a.candidate).resolve()
    baseline = pathlib.Path(a.baseline).resolve()
    work = pathlib.Path(a.work).resolve()
    out = pathlib.Path(a.out).resolve()
    if work.exists(): shutil.rmtree(work)
    shutil.copytree(baseline, work, symlinks=True)
    out.mkdir(parents=True, exist_ok=True)

    candidate_sha = run(['git','rev-parse','HEAD'], cwd=candidate).stdout.strip()
    baseline_sha = run(['git','rev-parse','HEAD'], cwd=baseline).stdout.strip()
    failures, apply_log = [], []

    baseline_obj = None
    if baseline_script:
        p = run(['node', str(candidate / baseline_script), str(baseline)], check=False)
        baseline_obj = parse_json_text(p.stdout, 'baseline')
        if p.returncode != 0:
            failures.append(f'baseline script exit {p.returncode}: {p.stderr[-4000:]}')

    for rel in apply_scripts:
        script = candidate / rel
        if not script.exists():
            failures.append(f'apply script missing: {rel}')
            continue
        cmd = [sys.executable, str(script), str(work)] if rel.endswith('.py') else ['node', str(script), str(work)]
        p = run(cmd, check=False)
        apply_log.append({'script': rel, 'exitCode': p.returncode, 'stdout': p.stdout[-12000:], 'stderr': p.stderr[-12000:]})
        if p.returncode != 0: failures.append(f'apply script failed: {rel}')

    for rel in changed_files:
        pth = work / rel
        if pth.exists():
            tracked = run(['git','ls-files','--error-unmatch',rel], cwd=work, check=False).returncode == 0
            if not tracked: run(['git','add','-N',rel], cwd=work, check=False)

    dc = run(['git','diff','--check'], cwd=work, check=False)
    if dc.returncode != 0: failures.append('git diff --check failed: ' + dc.stdout[-4000:] + dc.stderr[-4000:])

    actual = [x for x in run(['git','diff','--name-only'], cwd=work).stdout.splitlines() if x]
    outside = sorted(set(actual) - set(changed_files))
    if outside: failures.append('out-of-scope changed files: ' + ', '.join(outside))

    for row in syntax_checks:
        if isinstance(row, str): kind, rel = 'node', safe_rel(row, 'syntaxChecks')
        else: kind, rel = str(row.get('kind') or 'node'), safe_rel(row.get('path'), 'syntaxChecks.path')
        pth = work / rel
        if not pth.exists():
            failures.append(f'syntax target missing: {rel}'); continue
        if kind == 'node-esm':
            p = run(['node','--input-type=module','--check'], check=False, input_text=pth.read_text(encoding='utf-8'))
        else:
            p = run(['node','--check',str(pth)], check=False)
        if p.returncode != 0: failures.append(f'syntax failed {rel}: {p.stderr[-4000:]}')

    val = run(['node', str(candidate / validation_script), str(work)], check=False)
    validation_obj = parse_json_text(val.stdout, 'validation')
    if val.returncode != 0: failures.append(f'validation exit {val.returncode}')

    patch = run(['git','diff','--'] + changed_files, cwd=work).stdout
    patch_sha = hashlib.sha256(patch.encode('utf-8')).hexdigest()
    (out/'candidate.patch').write_text(patch, encoding='utf-8')
    (out/'candidate.patch.sha256').write_text(f'{patch_sha}  candidate.patch\n', encoding='utf-8')
    if baseline_obj is not None:
        (out/'baseline.json').write_text(json.dumps(baseline_obj, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (out/'validation.json').write_text(json.dumps(validation_obj, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

    status = 'PASS' if not failures else 'FAIL'
    result = {
        'schemaVersion':'FLR_CANDIDATE_QA_RESULT_1.0', 'version':version, 'candidateBranch':branch,
        'baselineRef':base_ref, 'baselineSha':baseline_sha, 'candidateSha':candidate_sha,
        'workflowStatus':status, 'validationExitCode':val.returncode, 'failures':failures,
        'changedFiles':actual, 'allowedChangedFiles':changed_files, 'patchSha256':patch_sha,
        'baseline':baseline_obj, 'validation':validation_obj, 'applyLog':apply_log,
        'validationStderr':val.stderr[-12000:]
    }
    (out/'CI_RESULT.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'version':version,'status':status,'patchSha256':patch_sha,'failures':failures}, ensure_ascii=False))
    return 0 if status == 'PASS' else 1

if __name__ == '__main__':
    try: sys.exit(main())
    except Exception as e:
        print(f'FLR_CANDIDATE_QA_RUNNER_ERROR: {e}', file=sys.stderr)
        sys.exit(2)
