#!/usr/bin/env python3
import hashlib,pathlib,subprocess,sys
root=pathlib.Path(sys.argv[1]).resolve()
here=pathlib.Path(__file__).resolve().parent
parts=sorted(here.glob('r26_transport.part*'))
if len(parts)!=5:
    print(f'R26_PART_COUNT:{len(parts)}',file=sys.stderr);raise SystemExit(2)
data=b''.join(p.read_bytes() for p in parts)
sha=hashlib.sha256(data).hexdigest()
print(f'R26_TRANSPORT bytes={len(data)} sha256={sha}')
if sha!='57173035dab6f1338dbf022b4e6bbdedaed7073cd881cd615a43e1fd8cdb65a1':
    print('R26_TRANSPORT_SHA_CHANGED',file=sys.stderr);raise SystemExit(2)
patch=root/'.r26-transport.patch';patch.write_bytes(data)
for args in (['git','apply','--check',str(patch)],['git','apply',str(patch)]):
    p=subprocess.run(args,cwd=root,text=True,capture_output=True)
    print('CMD',' '.join(args));print('STDOUT',p.stdout);print('STDERR',p.stderr)
    if p.returncode:
        raise SystemExit(p.returncode)
patch.unlink()
