#!/usr/bin/env python3
"""Parse a Chromium minidump: exception code, faulting thread, faulting module."""
import struct
import sys

MDMP = sys.argv[1]
data = open(MDMP, 'rb').read()

magic, version, n_streams, dir_rva, checksum, timestamp, flags = struct.unpack_from('<IIIIIIQ', data, 0)
assert magic == 0x504D444D, 'not a minidump'

streams = {}
for i in range(n_streams):
    st, size, rva = struct.unpack_from('<III', data, dir_rva + i * 12)
    streams.setdefault(st, []).append((size, rva))

# ModuleList = 4, Exception = 6, SystemInfo = 7, MemoryList = 5, ThreadList = 3
EXC = 6
MOD = 4
THR = 3

def utf16z(b):
    return b.decode('utf-16-le', 'ignore').split('\x00')[0]

modules = []
if MOD in streams:
    size, rva = streams[MOD][0]
    n, = struct.unpack_from('<I', data, rva)
    off = rva + 4
    for i in range(n):
        base, msize, cksum, tds, name_rva = struct.unpack_from('<QIIII', data, off)
        nlen, = struct.unpack_from('<I', data, name_rva)
        name = utf16z(data[name_rva + 4:name_rva + 4 + nlen])
        modules.append((base, msize, name))
        off += 108  # MINIDUMP_MODULE size

exc_info = None
if EXC in streams:
    size, rva = streams[EXC][0]
    tid, _align = struct.unpack_from('<II', data, rva)
    # MINIDUMP_EXCEPTION: code, flags, record, address, [8 params]
    code, eflags, record, addr = struct.unpack_from('<IIQQ', data, rva + 8)
    exc_info = (tid, code, addr)
    print(f'exception thread id: {tid}')
    print(f'exception code: 0x{code:08x}  address: 0x{addr:x}')

    # crashing thread context
    tctx_rva = rva + 8 + 152  # exception + padding -> thread context
    ctx_size, ctx_rva = struct.unpack_from('<II', data, rva + 8 + 152)
    # x86_64 CONTEXT: rip at offset 0xF8
    try:
        rip = struct.unpack_from('<Q', data, ctx_rva + 0xF8)[0]
        print(f'crash RIP: 0x{rip:x}')
        found = None
        for base, msize, name in modules:
            if base <= rip < base + msize:
                found = (name, hex(rip - base))
                break
        print('faulting module:', found if found else f'unknown (rip outside modules)')
    except Exception as e:
        print('ctx parse failed:', e)

print(f'\n{n_streams} streams, {len(modules)} modules')
# list likely relevant modules
for base, msize, name in modules:
    short = name.split('/')[-1].split('\\')[-1].lower()
    if any(k in short for k in ['libffmpeg', 'skia', 'audio', 'media', 'gpu', 'content', 'v8', 'blink', 'swiftshader', 'egl', ' angled']):
        print(f'  {name}  base=0x{base:x} size=0x{msize:x}')
