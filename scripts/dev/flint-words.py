#!/usr/bin/env python3
"""Build Flint's built-in word table (app/ui/flintwords.bin), the "tier 0.5" meaning layer that ships with the app.

Source: GloVe "Wikipedia 2014 + Gigaword 5" 100d (Pennington, Socher, Manning; Stanford NLP), released under the
Public Domain Dedication and License v1.0 (PDDL). Fetched once by a developer from the gensim-data mirror:
  https://github.com/RaRe-Technologies/gensim-data/releases/download/glove-wiki-gigaword-100/glove-wiki-gigaword-100.gz
Nothing is downloaded by the app: the table below is a file in app/ui.

Synonyms: the vectors are then pulled toward their WordNet synonyms and direct broader terms ("retrofitting",
Faruqui et al. 2015), so "chore" sits by "task" and "jot" by "write". WordNet 3.x is Copyright Princeton University,
under the WordNet licence (free to use, copy, modify and distribute with its notice; see NOTICE). The dict folder comes
from the npm package wordnet-db (`npm pack wordnet-db`, then pass .../package/dict as the second argument).

What it keeps: the most common words plus every word TribeCode's own text uses (the Guide, the command examples, the
tuned eval), with the common direction removed ("all-but-the-top"), reduced to DIM numbers each by PCA and stored as
int8. Rows stay in frequency order, so a word's row number is its rarity (flintmeaning.js weights words by it).

  python3 scripts/dev/flint-words.py /path/to/glove-wiki-gigaword-100.gz /path/to/wordnet/dict     writes app/ui/flintwords.bin
File layout: two u32 little-endian (header length, words length), a JSON header, the words joined by "\n" (utf-8), then n*dim int8,\nthen n bytes of part-of-speech bits (1 noun, 2 verb, 4 adjective, 8 adverb; 0 = not in WordNet).
"""
import gzip, json, os, re, struct, sys
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OWN = float(os.environ.get('FLINT_OWN', 1.0))
DIM, TOP, SCAN = int(os.environ.get('FLINT_DIM', 64)), int(os.environ.get('FLINT_TOP', 21000)), 150000
WORD = re.compile(r"^[a-z][a-z'-]{0,19}$")


def own_words():
    """Every word our own text uses: docs/guide, the command catalog's examples, the tuned eval, batches 7 and 8.
    (Never the held-out batch 9.)"""
    out, tok = set(), re.compile(r"[a-z][a-z'-]+")
    def eat(s): out.update(tok.findall(str(s).lower()))
    g = os.path.join(ROOT, 'docs', 'guide')
    for f in sorted(os.listdir(g)):
        if f.endswith('.md'): eat(open(os.path.join(g, f), encoding='utf8').read())
    for f in ('app/ui/flintnlu.js', 'app/ui/flintsem.js', 'app/ui/flintlessons.js', 'scripts/dev/flint-eval/held7.js', 'scripts/dev/flint-eval/held8.js', 'app/ui/guide-pages.json'):
        p = os.path.join(ROOT, f)
        if os.path.exists(p):
            for m in re.finditer(r"'([^'\n]{2,200})'|\"([^\"\n]{2,400})\"", open(p, encoding='utf8').read()): eat(m.group(1) or m.group(2))
    try:
        for c in json.load(open(os.path.join(ROOT, 'app', 'test', 'flint_eval.json'), encoding='utf8'))['cases']: eat(c.get('t', ''))
    except Exception: pass
    return out


def wordnet_edges(dict_dir, vocab):
    """word -> {other word: weight}, and word -> part-of-speech bits (1 noun, 2 verb, 4 adjective, 8 adverb).
    For a word's three most common senses per part of speech: its synonyms (1.0), words built from it
    ("seat"/"seating", 1.0), the words of the directly broader term, similar adjectives and verb groups (0.6), and the
    term two levels up (0.3). Single words only, both in the table."""
    edges, posbits = {}, {}
    def add(a, b, w):
        if a != b and a in vocab and b in vocab:
            edges.setdefault(a, {}); edges[a][b] = max(edges[a].get(b, 0), w)
            edges.setdefault(b, {}); edges[b][a] = max(edges[b].get(a, 0), w)
    PC = {'noun': 'n', 'verb': 'v', 'adj': 'a', 'adv': 'r'}; BIT = {'n': 1, 'v': 2, 'a': 4, 'r': 8}
    syn = {}
    for pos, c in PC.items():
        for line in open(os.path.join(dict_dir, 'data.' + pos), encoding='utf8'):
            if line.startswith('  '): continue
            parts = line.split('|')[0].split(); off, n = parts[0], int(parts[3], 16)
            ws = [parts[4 + 2 * k].lower() for k in range(n)]
            i = 4 + 2 * n; pc = int(parts[i]); ptrs = []
            for k in range(pc):
                sym, tgt, tpos, st = parts[i + 1 + 4 * k], parts[i + 2 + 4 * k], parts[i + 3 + 4 * k], parts[i + 4 + 4 * k]
                ptrs.append((sym, ('a' if tpos == 's' else tpos, tgt), int(st[:2], 16), int(st[2:], 16)))
            syn[(c, off)] = (ws, ptrs)
    for pos, c in PC.items():
        for line in open(os.path.join(dict_dir, 'index.' + pos), encoding='utf8'):
            if line.startswith('  '): continue
            parts = line.split(); w = parts[0]
            if '_' in w or w not in vocab: continue
            posbits[w] = posbits.get(w, 0) | BIT[c]
            pc = int(parts[3]); offs = parts[6 + pc:]
            for off in offs[:3]:
                ws, ptrs = syn.get((c, off), ([], []))
                for o in ws: add(w, o, 1.0)
                for sym, tk, src, tgt in ptrs:
                    tw, tp = syn.get(tk, ([], []))
                    if sym in ('+', '\\'):
                        if src and tgt and src <= len(ws) and tgt <= len(tw) and ws[src - 1] == w: add(w, tw[tgt - 1], 1.0)
                    elif sym in ('@', '@i', '&', '$'):
                        for o in tw: add(w, o, 0.6)
                        if sym in ('@', '@i'):
                            for s2, tk2, _, _ in tp:
                                if s2 in ('@', '@i'):
                                    for o in syn.get(tk2, ([], []))[0]: add(w, o, 0.3)
                                    break
    return edges, posbits


def retrofit(X, words, edges, iters=10):
    ix = {w: i for i, w in enumerate(words)}; Q = X.copy()
    nb = [(ix[w], [(ix[o], wt) for o, wt in e.items()]) for w, e in edges.items()]
    for _ in range(iters):
        for i, ns in nb:
            tot = sum(wt for _, wt in ns); own = OWN * tot; acc = X[i] * own   # OWN: how much the word's own vector counts against all its neighbours
            for j, wt in ns: acc = acc + Q[j] * wt
            Q[i] = acc / (own + tot)
    return Q


def main(src, wn=None):
    own = own_words(); posbits = {}
    words, rows = [], []
    with gzip.open(src, 'rt', encoding='utf8') as f:
        first = f.readline().split()
        if len(first) != 2: f.seek(0)
        for i, line in enumerate(f):
            if i >= SCAN: break
            w, _, rest = line.partition(' ')
            if not WORD.match(w): continue
            if len(words) < TOP or w in own:
                words.append(w); rows.append(np.asarray(rest.split(), dtype=np.float32))
    X = np.vstack(rows)
    X /= np.maximum(1e-6, np.linalg.norm(X, axis=1, keepdims=True))
    if wn:
        e, posbits = wordnet_edges(wn, set(words)); X = retrofit(X, words, e)
        print(f'retrofitted {len(e)} words to WordNet synonyms')
    X -= X.mean(axis=0)
    # all-but-the-top: drop the two directions every word shares (they carry frequency, not meaning)
    _, _, vt = np.linalg.svd(X[:TOP], full_matrices=False)
    for d in vt[:2]: X -= np.outer(X @ d, d)
    # PCA to DIM
    _, _, vt = np.linalg.svd(X[:TOP], full_matrices=False)
    Y = X @ vt[:DIM].T
    Y /= np.maximum(1e-6, np.linalg.norm(Y, axis=1, keepdims=True))
    q = np.clip(np.round(Y * 127), -127, 127).astype(np.int8)
    head = json.dumps({'v': 1, 'name': 'tribecode-words-64', 'dim': DIM, 'n': len(words), 'scale': 127, 'pos': True,
                       'source': 'GloVe Wikipedia 2014 + Gigaword 5 (100d), Stanford NLP', 'license': 'PDDL-1.0; synonyms from WordNet (Princeton University, WordNet licence)'}).encode()
    vocab = '\n'.join(words).encode('utf8')
    out = os.environ.get('FLINT_OUT') or os.path.join(ROOT, 'app', 'ui', 'flintwords.bin')
    with open(out, 'wb') as f:
        f.write(struct.pack('<II', len(head), len(vocab))); f.write(head); f.write(vocab); f.write(q.tobytes()); f.write(bytes(posbits.get(w, 0) for w in words))
    raw = os.path.getsize(out); gz = len(gzip.compress(open(out, 'rb').read(), 9))
    print(f'{len(words)} words x {DIM} -> {out}: {raw/1024:.0f} KB, {gz/1024:.0f} KB gzipped')


if __name__ == '__main__':
    if len(sys.argv) < 2: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
