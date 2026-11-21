/** Reference tab: open documents, bookmark pages, insert links, read page text. */
import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, Text, TextInput, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {ensureRead, ensureWrite} from '../permissions';
import {currentDocTotalPages} from '../refs';
import {
  addRef,
  fileName,
  insertRefLink,
  listDocuments,
  loadRefs,
  openAt,
  pageText,
  Ref,
  removeRef,
  scanDocumentsForRefs,
  whereAmI,
} from '../refs';
import {BOOKS, bookOf, Entry, ENTRIES, insertEntryLink, offsetFor, openEntry, resolveBooks, search} from '../lookup';
import {addTask, attachDoc, detachDoc, lastKnownSession, loadBoard, AttachedDoc} from '../tasks';
import {Button, Row, styles} from '../ui';

export function ReferenceScreen(): React.JSX.Element {
  const [here, setHere] = useState<{path: string; page: number; isDoc: boolean} | null>(null);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [docs, setDocs] = useState<string[] | null>(null);
  const [name, setName] = useState('');
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkSlot, setLinkSlot] = useState(0);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Entry[]>([]);
  const [bookPaths, setBookPaths] = useState<Map<string, string | null> | null>(null);
  const [printed, setPrinted] = useState('');
  const [attached, setAttached] = useState<AttachedDoc[]>([]);
  const [sceneSession, setSceneSession] = useState<number>(lastKnownSession);

  const guard = useCallback(async (fn: () => Promise<void>, write = false) => {
    setBusy(true);
    setError(null);
    try {
      await (write ? ensureWrite() : ensureRead());
      await fn();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  const reload = useCallback(async (w: {path: string; page: number; isDoc: boolean}) => {
    let extra: {path: string; pages: number} | undefined;
    if (w.isDoc) {
      try {
        extra = {path: w.path, pages: await currentDocTotalPages()};
      } catch {
        extra = {path: w.path, pages: w.page + 1};
      }
    }
    const loaded = await loadRefs(extra);
    setRefs(loaded.refs);
    setNotes(loaded.notes);
  }, []);

  const refresh = useCallback(
    () =>
      guard(async () => {
        const w = await whereAmI();
        setHere(w);
        setName(`${fileName(w.path).replace(/\.[^.]+$/, '')} p.${w.page + 1}`);
        await reload(w);
        if (!w.isDoc) {
          try {
            const b = await loadBoard();
            setAttached(b.docs);
            setSceneSession(b.session);
          } catch {
            // board unreadable here; attachments stay empty
          }
        } else {
          setSceneSession(lastKnownSession);
        }
      }),
    [guard, reload],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setHits(search(query));
  }, [query]);

  const openHit = (e: Entry) =>
    guard(async () => {
      setStatus(await openEntry(e));
      await PluginManager.closePluginView();
    });

  const linkHit = (e: Entry) =>
    guard(async () => {
      const code = await insertEntryLink(e, linkSlot);
      setLinkSlot(x => x + 1);
      setStatus(code === 0 ? `Link inserted: ${e.name}. Move it with the lasso.` : `insertTextLink returned ${code}`);
    }, true);

  const bookmark = () =>
    guard(async () => {
      if (!here) {
        return;
      }
      setStatus(`Saved: ${await addRef(name, here.path, here.page)}`);
      await reload(here);
    }, true);

  const open = (path: string, page: number) =>
    guard(async () => {
      await openAt(path, page);
      await PluginManager.closePluginView();
    });

  const link = (ref: Ref) =>
    guard(async () => {
      const code = await insertRefLink(ref, linkSlot);
      setLinkSlot(s => s + 1);
      setStatus(code === 0 ? `Link inserted: ${ref.name}. Move it with the lasso.` : `insertTextLink returned ${code}`);
    }, true);

  const readText = () =>
    guard(async () => {
      if (!here) {
        return;
      }
      setText(await pageText(here.page));
    });

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.h1}>References</Text>
      {here && (
        <Text style={styles.muted}>
          now: {fileName(here.path)} · page {here.page + 1} · {here.isDoc ? 'document' : 'note'}
        </Text>
      )}
      {status && <Text style={styles.body}>{status}</Text>}
      {error && (
        <Text style={styles.error} selectable>
          {error}
        </Text>
      )}

      <Text style={styles.h2}>Look up ({ENTRIES.length} entries)</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        style={{borderWidth: 3, borderColor: '#000', padding: 10, fontSize: 20, color: '#000', marginBottom: 6}}
        placeholder="monster, spell, condition…"
        placeholderTextColor="#000"
      />
      {query.trim() !== '' && hits.length === 0 && <Text style={styles.muted}>No match. Add it to campaign/references.md and rebuild.</Text>}
      {hits.map(e => (
        <View key={`${e.book}-${e.name}`} style={{borderBottomWidth: 1, borderBottomColor: '#000', paddingVertical: 6}}>
          <Text style={styles.body}>
            {e.name} <Text style={styles.muted}>· {e.book} p.{e.page}{e.tags ? ` · ${e.tags}` : ''}</Text>
          </Text>
          <Row>
            <Button small label="Open" disabled={busy} onPress={() => openHit(e)} />
            {here && !here.isDoc && <Button small label="Insert link here" disabled={busy} onPress={() => linkHit(e)} />}
          </Row>
        </View>
      ))}
      <Row>
        <Button
          small
          label={bookPaths ? 'Books: re-check' : 'Books: check which are on the device'}
          disabled={busy}
          onPress={() => guard(async () => setBookPaths(new Map(await resolveBooks(true))))}
        />
      </Row>
      {bookPaths &&
        BOOKS.map(b => (
          <Text key={b.key} style={styles.muted}>
            {b.key}: {bookPaths.get(b.key) ? fileName(bookPaths.get(b.key)!) : `not found (file name containing "${b.match}")`} · offset {b.offset}
          </Text>
        ))}

      {here?.isDoc && (
        <View>
          <Text style={styles.h2}>Calibrate this book</Text>
          <Text style={styles.muted}>PDF page index on screen: {here.page}. Type the printed page number you see:</Text>
          <Row>
            <TextInput
              value={printed}
              onChangeText={setPrinted}
              keyboardType="numeric"
              style={{borderWidth: 3, borderColor: '#000', padding: 10, fontSize: 20, color: '#000', width: 140, marginRight: 12}}
              placeholder="printed"
              placeholderTextColor="#000"
            />
            {Number.isFinite(Number(printed)) && printed.trim() !== '' && (
              <Text style={styles.body}>offset = {offsetFor(here.page, Number(printed))} → write it in references.md</Text>
            )}
          </Row>
          <Text style={styles.h2}>Bookmark this page</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={{borderWidth: 3, borderColor: '#000', padding: 10, fontSize: 20, color: '#000', marginBottom: 10}}
            placeholder="name, e.g. Owlbear"
            placeholderTextColor="#000"
          />
          <Row>
            <Button label="Save bookmark" disabled={busy || !name.trim()} onPress={bookmark} />
            <Button label="Read page text" hint="the PDF text layer" disabled={busy} onPress={readText} />
          </Row>
          <Text style={styles.h2}>Scene for tonight</Text>
          <Text style={styles.muted}>Writes "Scene S{sceneSession} | {name.slice(0, 20)}…" on this PDF page. Attach this PDF to the campaign note so Tonight finds it.</Text>
          <Row>
            <Button small label="−" disabled={busy || sceneSession <= 1} onPress={() => setSceneSession(x => x - 1)} />
            <Text style={[styles.body, {marginHorizontal: 8}]}>S{sceneSession}</Text>
            <Button small label="+" disabled={busy} onPress={() => setSceneSession(x => x + 1)} />
            <Button
              label={`Add as Scene for S${sceneSession}`}
              disabled={busy || !name.trim() || !here}
              onPress={() =>
                guard(async () => {
                  const kw = await addTask(here!.path, here!.page, 'scene', name, sceneSession);
                  setStatus(`Saved on this page: ${kw}`);
                }, true)
              }
            />
          </Row>
          {text !== null && (
            <Text style={[styles.mono, {borderWidth: 1, borderColor: '#000', padding: 8}]} selectable>
              {text.trim() || '(no text layer on this page)'}
            </Text>
          )}
        </View>
      )}

      <Text style={styles.h2}>Bookmarks ({refs.length})</Text>
      {bookOf({name: '', book: 'EXAMPLE', page: 0, tags: ''}) && ENTRIES.some(e => e.book === 'EXAMPLE') && (
        <Text style={styles.muted}>The lookup table still has the example rows; edit campaign/references.md.</Text>
      )}
      {notes.map((n, i) => (
        <Text key={i} style={styles.muted}>
          {n}
        </Text>
      ))}
      {refs.length === 0 && <Text style={styles.body}>None loaded. Open a PDF and save one, or scan your documents.</Text>}
      <Row>
        <Button
          small
          label="Scan documents for bookmarks"
          disabled={busy}
          onPress={() =>
            guard(async () => {
              const found = await scanDocumentsForRefs();
              setRefs(prev => {
                const seen = new Set(prev.map(r => `${r.storedIn}#${r.storedPage}#${r.index}`));
                return [...prev, ...found.refs.filter(r => !seen.has(`${r.storedIn}#${r.storedPage}#${r.index}`))].sort((a, b) => a.name.localeCompare(b.name));
              });
              setNotes(found.notes);
              setStatus(`Scanned: ${found.refs.length} bookmarks found`);
            })
          }
        />
      </Row>
      {refs.map(r => (
        <View key={`${r.index}-${r.name}`} style={{borderBottomWidth: 1, borderBottomColor: '#000', paddingVertical: 8}}>
          <Text style={styles.body}>{r.name}</Text>
          <Text style={styles.muted}>
            {fileName(r.path)} · p.{r.page + 1}
          </Text>
          <Row>
            <Button small label="Open" disabled={busy} onPress={() => open(r.path, r.page)} />
            {here && !here.isDoc && <Button small label="Insert link here" disabled={busy} onPress={() => link(r)} />}
            <Button small label="Remove" disabled={busy} onPress={() => guard(async () => { await removeRef(r); if (here) { await reload(here); } }, true)} />
          </Row>
        </View>
      ))}

      {here && !here.isDoc && (
        <View>
          <Text style={styles.h2}>Attached to this campaign ({attached.length})</Text>
          <Text style={styles.muted}>Scenes written inside these PDFs appear on Tonight.</Text>
          {attached.map(d => (
            <Row key={`${d.page}-${d.index}`}>
              <Text style={[styles.body, {flex: 1}]}>{d.name}</Text>
              <Button
                small
                label="Detach"
                disabled={busy}
                onPress={() => guard(async () => { await detachDoc(here.path, d); setAttached((await loadBoard()).docs); }, true)}
              />
            </Row>
          ))}
        </View>
      )}

      <Text style={styles.h2}>Documents</Text>
      {docs === null ? (
        <Button label="List documents" hint="PDF, EPUB under Document" disabled={busy} onPress={() => guard(async () => setDocs(await listDocuments()))} />
      ) : docs.length === 0 ? (
        <Text style={styles.body}>No documents found under Document.</Text>
      ) : (
        docs.map(d => (
          <Row key={d}>
            <Button small label="Open" disabled={busy} onPress={() => open(d, -1)} />
            {here && !here.isDoc && (
              <Button
                small
                label="Attach"
                disabled={busy || attached.some(a => fileName(d).toLowerCase().includes(a.name.toLowerCase()))}
                onPress={() =>
                  guard(async () => {
                    setStatus(`Attached: ${await attachDoc(here.path, fileName(d))}`);
                    setAttached((await loadBoard()).docs);
                  }, true)
                }
              />
            )}
            <Text style={[styles.body, {flex: 1, marginLeft: 10}]}>{fileName(d)}</Text>
          </Row>
        ))
      )}
      <View style={{height: 80}} />
    </ScrollView>
  );
}
