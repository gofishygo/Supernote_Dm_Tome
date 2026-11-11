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
  whereAmI,
} from '../refs';
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
      }),
    [guard, reload],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

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

      {here?.isDoc && (
        <View>
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
          {text !== null && (
            <Text style={[styles.mono, {borderWidth: 1, borderColor: '#000', padding: 8}]} selectable>
              {text.trim() || '(no text layer on this page)'}
            </Text>
          )}
        </View>
      )}

      <Text style={styles.h2}>Bookmarks ({refs.length})</Text>
      {notes.map((n, i) => (
        <Text key={i} style={styles.muted}>
          {n}
        </Text>
      ))}
      {refs.length === 0 && <Text style={styles.body}>None yet. Open a PDF, come back here, and save one.</Text>}
      {refs.map(r => (
        <View key={`${r.index}-${r.name}`} style={{borderBottomWidth: 1, borderBottomColor: '#000', paddingVertical: 8}}>
          <Text style={styles.body}>{r.name}</Text>
          <Text style={styles.muted}>
            {fileName(r.path)} · p.{r.page + 1}{r.storedIn.endsWith('Index.note') ? '' : ' · stored on the document'}
          </Text>
          <Row>
            <Button small label="Open" disabled={busy} onPress={() => open(r.path, r.page)} />
            {here && !here.isDoc && <Button small label="Insert link here" disabled={busy} onPress={() => link(r)} />}
            <Button small label="Remove" disabled={busy} onPress={() => guard(async () => { await removeRef(r); if (here) { await reload(here); } }, true)} />
          </Row>
        </View>
      ))}

      <Text style={styles.h2}>Documents</Text>
      {docs === null ? (
        <Button label="List documents" hint="PDF, EPUB under Document" disabled={busy} onPress={() => guard(async () => setDocs(await listDocuments()))} />
      ) : docs.length === 0 ? (
        <Text style={styles.body}>No documents found under Document.</Text>
      ) : (
        docs.map(d => (
          <Row key={d}>
            <Button small label="Open" disabled={busy} onPress={() => open(d, -1)} />
            <Text style={[styles.body, {flex: 1, marginLeft: 10}]}>{fileName(d)}</Text>
          </Row>
        ))
      )}
      <View style={{height: 80}} />
    </ScrollView>
  );
}
