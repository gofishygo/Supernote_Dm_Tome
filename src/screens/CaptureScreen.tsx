/**
 * Lasso → recognized text → type → (due session) → saved as a keyword.
 * Persistent types (Hero, NPC) save on the type tap. Dated types ask when.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, Text, TextInput, View} from 'react-native';
import {PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {ensureRead, ensureWrite} from '../permissions';
import {addRef, isDocument} from '../refs';
import {addTask, CAPTURE_TYPES, currentFile, currentPage, EntryType, loadBoard, TYPE_META} from '../tasks';
import {Button, Row, styles} from '../ui';

type ApiResponse<T> = {success: boolean; result: T | null; error: {code: number; message: string} | null};

function unwrap<T>(raw: unknown, what: string): T {
  const res = raw as ApiResponse<T> | null | undefined;
  if (!res?.success || res.result === null || res.result === undefined) {
    throw new Error(`${what} failed: ${res?.error?.code ?? '?'} ${res?.error?.message ?? ''}`);
  }
  return res.result;
}

export function CaptureScreen(): React.JSX.Element {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('Recognizing…');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<number>(1);
  const [page, setPage] = useState<number>(0);
  const [path, setPath] = useState<string>('');
  const [type, setType] = useState<EntryType | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await ensureRead();
        const p = await currentFile();
        const pg = await currentPage();
        setPath(p);
        setPage(pg);
        let size: {width: number; height: number};
        let note = '';
        try {
          size = unwrap<{width: number; height: number}>(await PluginFileAPI.getPageSize(p, pg), 'getPageSize');
        } catch (sizeErr) {
          const dev = await PluginManager.getDeviceType();
          size = dev === 5 ? {width: 1920, height: 2560} : {width: 1404, height: 1872};
          note = ` · page size fallback ${size.width}x${size.height}`;
        }
        const elements = unwrap<Object[]>(await PluginCommAPI.getLassoElements(), 'getLassoElements');
        const recognized = unwrap<string>(await PluginCommAPI.recognizeElements(elements, size), 'recognizeElements');
        setText(recognized.replace(/\s+/g, ' ').trim());
        setStatus(`${elements.length} strokes on page ${pg + 1}. Edit if needed, then pick a type.${note}`);
        try {
          setSession((await loadBoard()).session);
        } catch {
          // no session keyword yet; default 1
        }
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
        setStatus('Recognition failed.');
      }
    })();
  }, []);

  const finish = useCallback(async (fn: () => Promise<string>) => {
    if (!text.trim()) {
      setError('Nothing to save: the recognized text is empty.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await ensureWrite();
      setStatus(await fn());
      try {
        await PluginCommAPI.setLassoBoxState(2);
      } catch {
        // lasso may already be gone
      }
      await PluginManager.closePluginView();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }, [text]);

  const saveEntry = (t: EntryType, due: number | null) =>
    finish(async () => `Saved: ${await addTask(path, page, t, text, due)}`);

  const pickType = (t: EntryType) => {
    if (TYPE_META[t].dated) {
      setType(t);
    } else {
      saveEntry(t, null);
    }
  };

  const saveRef = () => finish(async () => `Bookmarked: ${await addRef(text, path, page)}`);

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.h1}>Capture</Text>
      <Text style={styles.muted}>{status}</Text>
      {error && (
        <Text style={styles.error} selectable>
          {error}
        </Text>
      )}
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        style={{borderWidth: 3, borderColor: '#000', padding: 12, fontSize: 22, color: '#000', minHeight: 90, marginVertical: 12}}
        placeholder="recognized text"
        placeholderTextColor="#000"
      />

      {type === null ? (
        <View>
          <Text style={styles.h2}>What is it?</Text>
          <Row>
            {CAPTURE_TYPES.map(t => (
              <Button
                key={t}
                label={TYPE_META[t].label}
                hint={TYPE_META[t].dated ? 'then pick a session' : 'always on the board'}
                disabled={saving}
                onPress={() => pickType(t)}
              />
            ))}
          </Row>
          <Text style={styles.h2}>Or bookmark this page under that name</Text>
          <Row>
            <Button
              label={isDocument(path) ? 'Save as reference' : 'Save as reference (note page)'}
              hint={`${path.split('/').pop() ?? ''} p.${page + 1}`}
              disabled={saving}
              onPress={saveRef}
            />
          </Row>
        </View>
      ) : (
        <View>
          <Text style={styles.h2}>
            {TYPE_META[type].label}: which session? (now {session})
          </Text>
          <Row>
            <Button label={`This session (S${session})`} disabled={saving} onPress={() => saveEntry(type, session)} />
            <Button label={`Next (S${session + 1})`} disabled={saving} onPress={() => saveEntry(type, session + 1)} />
            <Button label={`S${session + 2}`} disabled={saving} onPress={() => saveEntry(type, session + 2)} />
            <Button label={`S${session + 3}`} disabled={saving} onPress={() => saveEntry(type, session + 3)} />
            <Button label="Someday" hint="no session yet" disabled={saving} onPress={() => saveEntry(type, null)} />
          </Row>
          <Button small label="← Back to type" disabled={saving} onPress={() => setType(null)} />
        </View>
      )}

      <View style={{height: 24}} />
      <Button label="Cancel" disabled={saving} onPress={() => PluginManager.closePluginView()} />
    </ScrollView>
  );
}
