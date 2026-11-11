/**
 * Lasso → recognized text → one tap files it as a Back Burner task.
 * Opened from the lasso toolbar button. Three taps, no typing required.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, Text, TextInput, View} from 'react-native';
import {PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {ensureRead, ensureWrite} from '../permissions';
import {addTask, currentFile, currentPage, loadBoard} from '../tasks';
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await ensureRead();
        const p = await currentFile();
        const pg = await currentPage();
        setPath(p);
        setPage(pg);
        const size = unwrap<{width: number; height: number}>(await PluginFileAPI.getPageSize(p, pg), 'getPageSize');
        const elements = unwrap<Object[]>(await PluginCommAPI.getLassoElements(), 'getLassoElements');
        const recognized = unwrap<string>(await PluginCommAPI.recognizeElements(elements, size), 'recognizeElements');
        setText(recognized.replace(/\s+/g, ' ').trim());
        setStatus(`${elements.length} strokes on page ${pg + 1}. Edit if needed, then pick when it is due.`);
        try {
          const board = await loadBoard();
          setSession(board.session);
        } catch {
          // no session keyword yet; default 1
        }
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
        setStatus('Recognition failed.');
      }
    })();
  }, []);

  const save = useCallback(
    async (due: number | null) => {
      if (!text.trim()) {
        setError('Nothing to save: the recognized text is empty.');
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await ensureWrite();
        const keyword = await addTask(path, page, text, due);
        setStatus(`Saved as keyword: ${keyword}`);
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
    },
    [path, page, text],
  );

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.h1}>Capture to Back Burner</Text>
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
      <Text style={styles.h2}>Due (current session {session})</Text>
      <Row>
        <Button label={`Next session (S${session + 1})`} disabled={saving} onPress={() => save(session + 1)} />
        <Button label={`S${session + 2}`} disabled={saving} onPress={() => save(session + 2)} />
        <Button label={`S${session + 3}`} disabled={saving} onPress={() => save(session + 3)} />
        <Button label="This session" disabled={saving} onPress={() => save(session)} />
        <Button label="Someday" hint="no due session" disabled={saving} onPress={() => save(null)} />
      </Row>
      <View style={{height: 24}} />
      <Button label="Cancel" disabled={saving} onPress={() => PluginManager.closePluginView()} />
    </ScrollView>
  );
}
