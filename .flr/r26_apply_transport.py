#!/usr/bin/env python3
import hashlib,pathlib,subprocess,sys
root=pathlib.Path(sys.argv[1]).resolve()
here=pathlib.Path(__file__).resolve().parent
parts=sorted(here.glob('r26_transport.part*'))
if len(parts)!=5:
    raise SystemExit(f'R26_PART_COUNT:{len(parts)}')
data=b''.join(p.read_bytes() for p in parts)
sha=hashlib.sha256(data).hexdigest()
print(f'R26_TRANSPORT bytes={len(data)} sha256={sha}')
if sha!='57173035dab6f1338dbf022b4e6bbdedaed7073cd881cd615a43e1fd8cdb65a1':
    raise SystemExit('R26_TRANSPORT_SHA_CHANGED')
patch=root/'.r26-transport.patch'
patch.write_bytes(data)
subprocess.check_call(['git','apply','--check',str(patch)],cwd=root)
subprocess.check_call(['git','apply',str(patch)],cwd=root)
patch.unlink()
