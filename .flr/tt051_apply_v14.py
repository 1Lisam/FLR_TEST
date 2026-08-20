#!/usr/bin/env python3
from pathlib import Path
import base64, gzip, hashlib, subprocess, sys, tempfile

EXPECTED_PATCH_SHA256 = '4f0398a588fd8af39487426498c4c57fb37effc70158a57fafbc7c9439282560'

def main():
    if len(sys.argv) != 2:
        print('usage: tt051_apply.py <destination-root>', file=sys.stderr)
        return 2
    candidate_root = Path(__file__).resolve().parent.parent
    parts = sorted((candidate_root / '.flr').glob('tt051_candidate.patch.b64.part*'))
    dst = Path(sys.argv[1]).resolve()
    if not parts:
        raise FileNotFoundError('TT-0.51 encoded patch parts missing')
    encoded = b''.join(p.read_bytes() for p in parts)
    data = gzip.decompress(base64.b64decode(encoded, validate=True))
    actual = hashlib.sha256(data).hexdigest()
    if actual != EXPECTED_PATCH_SHA256:
        raise RuntimeError(f'TT-0.51 patch SHA mismatch: {actual}')
    with tempfile.NamedTemporaryFile(prefix='tt051-',suffix='.patch',delete=False) as f:
        f.write(data); patch = Path(f.name)
    try:
        subprocess.run(['git','apply','--check',str(patch)], cwd=dst, check=True)
        subprocess.run(['git','apply',str(patch)], cwd=dst, check=True)
    finally:
        patch.unlink(missing_ok=True)
    print(f'TT-0.51 candidate patch applied: {len(data)} bytes from {len(parts)} encoded parts; sha256={actual}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
