/** Script tab: sessions and scenes compiled from campaign/*.md, inserted as text boxes. */
import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';
import {PluginCommAPI, PluginManager} from 'sn-plugin-lib';
import {ensureWrite} from '../permissions';
import {isDocPath} from '../tasks';
import {GENERATED_AT, insertScene, insertSessionAsPages, Scene, sceneSummary, SESSIONS, Session} from '../script';
import {Button, Row, styles} from '../ui';

export function ScriptScreen(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(SESSIONS[0] ?? null);
  const [open, setOpen] = useState<number | null>(null);
  const [inDoc, setInDoc] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextTop, setNextTop] = useState<number | null>(null);
  const [steps, setSteps] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = (await PluginCommAPI.getCurrentFilePath()) as {success: boolean; result: string | null};
        setInDoc(!!res?.result && isDocPath(res.result));
      } catch {
        // leave as note
      }
    })();
  }, []);

  const insert = useCallback(
    async (scene: Scene, chain: boolean) => {
      setBusy(true);
      setError(null);
      try {
        await ensureWrite();
        const start = chain && nextTop !== null ? nextTop : undefined;
        const r = await insertScene(scene, start);
        setNextTop(r.nextTop);
        setStatus(`Inserted "${scene.title}": ${r.boxes} text boxes. Close to see the page; move boxes with the lasso.`);
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setBusy(false);
      }
    },
    [nextTop],
  );

  const insertPages = useCallback(async (s: Session) => {
    setBusy(true);
    setError(null);
    setSteps([]);
    try {
      await ensureWrite();
      const n = await insertSessionAsPages(s, msg => setSteps(prev => [...prev, msg]));
      setStatus(`Laid "${s.title}" across ${n} new page(s) after this one. Close to read them.`);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.h1}>Script</Text>
      <Text style={styles.muted}>
        {SESSIONS.length} session{SESSIONS.length === 1 ? '' : 's'} compiled {GENERATED_AT.slice(0, 16).replace('T', ' ')} · edit campaign/*.md on the PC, rebuild, reinstall
      </Text>
      {inDoc && <Text style={[styles.body, {marginTop: 8}]}>Text boxes can only be inserted into a note. Open your campaign note first.</Text>}
      {status && <Text style={[styles.body, {marginTop: 8}]}>{status}</Text>}
      {error && (
        <Text style={styles.error} selectable>
          {error}
        </Text>
      )}

      {SESSIONS.length === 0 && (
        <Text style={[styles.body, {marginTop: 12}]}>No scripts yet. Add a Markdown file under campaign/ and rebuild.</Text>
      )}

      {SESSIONS.length > 1 && (
        <Row>
          {SESSIONS.map(s => (
            <Button small key={s.number} label={`S${s.number}`} disabled={busy} onPress={() => { setSession(s); setOpen(null); }} />
          ))}
        </Row>
      )}

      {steps.length > 0 && (
        <View style={{borderWidth: 2, borderColor: '#000', padding: 8, marginTop: 8}}>
          {steps.map((m, i) => (
            <Text key={i} style={styles.mono}>
              {m}
            </Text>
          ))}
        </View>
      )}

      {session && (
        <View>
          <Text style={styles.h2}>{session.title}</Text>
          <Button
            label="Insert whole session as new pages"
            hint={`${session.intro.length ? 'intro page + ' : ''}${session.scenes.length} scene page(s) after the page you have open`}
            disabled={busy || inDoc}
            onPress={() => insertPages(session)}
          />
          {session.intro.length > 0 && (
            <Text style={[styles.muted, {marginBottom: 8}]} numberOfLines={3}>
              {session.intro.map(b => b.text).join(' ')}
            </Text>
          )}
          {session.scenes.map((scene, i) => (
            <View key={i} style={{borderBottomWidth: 1, borderBottomColor: '#000', paddingVertical: 8}}>
              <Row>
                <Text style={[styles.body, {flex: 1, fontWeight: '700'}]}>{scene.title}</Text>
                <Button small label={open === i ? 'Hide' : 'Preview'} disabled={busy} onPress={() => setOpen(open === i ? null : i)} />
              </Row>
              <Text style={styles.muted}>{sceneSummary(scene)}</Text>
              {open === i &&
                scene.blocks.map((b, j) => (
                  <Text key={j} style={[styles.body, {marginTop: 6}, b.kind === 'quote' && {fontStyle: 'italic'}]}>
                    {b.text}
                  </Text>
                ))}
              <Row>
                <Button small label="Insert on this page" hint="from the top" disabled={busy || inDoc} onPress={() => insert(scene, false)} />
                {nextTop !== null && (
                  <Button small label="Insert below the last" disabled={busy || inDoc} onPress={() => insert(scene, true)} />
                )}
              </Row>
            </View>
          ))}
        </View>
      )}
      <View style={{height: 24}} />
      <Button label="Close and look at the page" disabled={busy} onPress={() => PluginManager.closePluginView()} />
      <View style={{height: 80}} />
    </ScrollView>
  );
}
