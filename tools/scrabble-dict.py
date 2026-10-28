#!/usr/bin/env python3
"""Gera games/scrabble/dict.js (lista de palavras do Scrabble em portugues) a partir do dicionario Hunspell VERO (pt_BR).

Uso: python3 tools/scrabble-dict.py <pasta com pt_BR.aff e pt_BR.dic> [saida=games/scrabble/dict.js]
Fonte dos arquivos: https://github.com/LibreOffice/dictionaries/tree/master/pt_BR (VERO, Raimundo Santos Moura;
licencas LGPLv3 / MPL, ver o cabecalho do pt_BR.aff).

Passos: expande os afixos (plurais, femininos, conjugacoes), descarta nomes proprios, siglas e palavras com hifen,
tira os acentos (o Scrabble em portugues ignora acentos; o Ç e uma peca propria), mantem 2 a 15 letras e grava o
resultado como um DAWG compactado em base64 (leitura sincrona, sem descompactar).
"""
import sys, re, unicodedata, collections, struct, base64
SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else 'games/scrabble/dict.js'
aff = open(SRC + '/pt_BR.aff', encoding='utf-8-sig').read().splitlines()
rules = {'PFX': collections.defaultdict(list), 'SFX': collections.defaultdict(list)}
cross = {}
i = 0
while i < len(aff):
    p = aff[i].split('#')[0].split()
    if len(p) >= 4 and p[0] in ('PFX', 'SFX') and p[2] in ('Y', 'N') and p[3].isdigit():
        kind, flag, cr, n = p[0], p[1], p[2] == 'Y', int(p[3])
        cross[(kind, flag)] = cr
        for j in range(n):
            q = aff[i + 1 + j].split('#')[0].split()
            strip = '' if q[2] == '0' else q[2]
            add = q[3]
            cont = ''
            if '/' in add:
                add, cont = add.split('/', 1)
            add = '' if add == '0' else add
            cond = q[4] if len(q) > 4 else '.'
            rx = re.compile(('^' + cond) if kind == 'PFX' else (cond + '$'))
            rules[kind][flag].append((strip, add, rx, cont, cr))
        i += n + 1
    else:
        i += 1
lines = open(SRC + '/pt_BR.dic', encoding='utf-8-sig').read().splitlines()[1:]
words = set()
def apply(kind, flag, w):
    out = []
    for strip, add, rx, cont, cr in rules[kind].get(flag, []):
        if not rx.search(w): continue
        if kind == 'SFX':
            if strip and not w.endswith(strip): continue
            nw = (w[:len(w)-len(strip)] if strip else w) + add
        else:
            if strip and not w.startswith(strip): continue
            nw = add + (w[len(strip):] if strip else w)
        out.append((nw, cont, cr))
    return out
for ln in lines:
    ln = ln.split('\t')[0].strip()
    if not ln: continue
    if '/' in ln: w, flags = ln.split('/', 1)
    else: w, flags = ln, ''
    # so palavras comuns: sem maiuscula inicial (nomes proprios/siglas)
    if not w or w[0].isupper() or any(c.isupper() for c in w): continue
    forms = {w}
    sfx = []; pfx = []
    for f in flags:
        for nw, cont, cr in apply('SFX', f, w):
            forms.add(nw); sfx.append((nw, cr))
            for c in cont:
                for nw2, _, _ in apply('SFX', c, nw): forms.add(nw2)
        for nw, cont, cr in apply('PFX', f, w):
            forms.add(nw); pfx.append((nw, cr))
    for f in flags:
        for pw, pcr in [(x, c) for x, c in pfx if c]:
            pass
    # produto cruzado prefixo x sufixo
    for f in flags:
        for strip, add, rx, cont, cr in rules['PFX'].get(f, []):
            if not cr: continue
            for sw, scr in sfx:
                if not scr: continue
                if rx.search(sw) and (not strip or sw.startswith(strip)):
                    forms.add(add + (sw[len(strip):] if strip else sw))
    words |= forms
print('formas brutas', len(words), file=sys.stderr)
ALPHA = set('abcdefghijlmnopqrstuvxzç')
def norm(w):
    out = []
    for ch in unicodedata.normalize('NFD', w):
        if unicodedata.combining(ch) and ch != '̧': continue
        out.append(ch)
    s = unicodedata.normalize('NFC', ''.join(out))
    return s
keep = set()
for w in words:
    n = norm(w)
    # exige vogal: descarta siglas e abreviaturas (cm, ftp, dr...)
    if 2 <= len(n) <= 15 and all(c in ALPHA for c in n) and any(c in 'aeiou' for c in n): keep.add(n)
print('validas', len(keep), file=sys.stderr)
words = sorted(keep)

LET = 'abcdefghijlmnopqrstuvxzç'   # 24 letras (indices 1..24)
IDX = {c: i + 1 for i, c in enumerate(LET)}
# Daciuk: construcao incremental com entrada ordenada
class Node:
    __slots__ = ('edges', 'final', 'id')
    def __init__(self): self.edges = {}; self.final = False; self.id = None
registry = {}
def sig(n): return (n.final, tuple((k, c.id) for k, c in sorted(n.edges.items())))
nid = [0]
def minimize(node):
    s = sig(node)
    if s in registry: return registry[s]
    node.id = nid[0]; nid[0] += 1
    registry[s] = node
    return node
root = Node(); root.id = -1
stack = []   # (parent, char, child) do ultimo caminho
prev = ''
def replace_or_register(depth_keep):
    while len(stack) > depth_keep:
        parent, ch, child = stack.pop()
        parent.edges[ch] = minimize(child)
last_path_nodes = [root]
for w in words:
    # prefixo comum
    k = 0
    while k < len(prev) and k < len(w) and prev[k] == w[k]: k += 1
    replace_or_register(k)
    node = stack[-1][2] if stack else root
    for ch in w[k:]:
        child = Node()
        node.edges[ch] = child
        stack.append((node, ch, child))
        node = child
    node.final = True
    prev = w
replace_or_register(0)
root = minimize(root) if False else root
# numera nos em ordem e empacota arestas: 32 bits = [child:22][last:1][eow:1][letter:5]... usamos 24 bits de filho
order = []
seen = {}
def collect(n):
    if id(n) in seen: return
    seen[id(n)] = None
    for k, c in sorted(n.edges.items()): collect(c)
    order.append(n)
sys.setrecursionlimit(10000)
collect(root)
# layout: aresta = letra(5) | eow(1) | last(1) | filho(25)
start = {}
pos = 1
for n in order:   # filhos antes dos pais
    start[id(n)] = pos
    pos += max(len(n.edges), 0)
total = pos
print('nos', len(order), 'arestas', total, file=sys.stderr)
buf = bytearray(4 * (total + 1))
for n in order:
    base = start[id(n)]
    items = sorted(n.edges.items())
    for j, (ch, c) in enumerate(items):
        child_start = start[id(c)] if c.edges else 0
        v = IDX[ch] | (int(c.final) << 5) | (int(j == len(items) - 1) << 6) | (child_start << 7)
        struct.pack_into('<I', buf, 4 * base, v) if False else struct.pack_into('<I', buf, 4 * (base + j), v)
rootpos = start[id(root)]
print('raiz', rootpos, 'bytes', len(buf), file=sys.stderr)

js = ("'use strict';\n// GERADO por tools/scrabble-dict.py (dicionario VERO pt_BR, LGPLv3/MPL). Nao edite.\n"
      "// DAWG: aresta = letra(5 bits) | fim-de-palavra(1) | ultima-do-no(1) | filho(25 bits); letras: " + LET + "\n"
      "module.exports = { letters: '" + LET + "', root: " + str(rootpos) + ", count: " + str(len(words)) + ", data: '" + base64.b64encode(bytes(buf)).decode() + "' };\n")
open(OUT, 'w', encoding='utf-8').write(js)
print('gravado', OUT, len(js), 'bytes;', len(words), 'palavras', file=sys.stderr)
