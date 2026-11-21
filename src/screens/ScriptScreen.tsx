/** Script tab: sessions and scenes compiled from campaign/*.md, inserted as text boxes. */
import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';
import {PluginCommAPI, PluginManager} from 'sn-plugin-lib';
import {ensureWrite} from '../permissions';
import {isDocPath} from '../tasks';
import {CHARACTERS, GENERATED_AT, insertScene, insertSessionAsPages, Scene, sceneSummary, SESSIONS, Session} from '../script';
import {Button, Row, styles} from '../ui';

export function ScriptScreen(): React.JSX.Element {
  const [kind, setKind] = useState<'sessions' | 'characters'>('sessions');
  const [session, setSession] = useState<Session | null>(SESSIONS[0] ?? null);
  const list = kind === 'sessions' ? SESSIONS : CHARACTERS;
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
        setStatus(`Inserted "${scene.title}": ${r.boxes} text boxes, ${r.titleNote}, ${r.borderNote}. Close to see the page; move boxes with the lasso.`);
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
      <Row>
        <Text style={[styles.h1, {marginRight: 16}]}>Script</Text>
        <Button small label={`Sessions (${SESSIONS.length})`} disabled={busy} onPress={() => { setKind('sessions'); setSession(SESSIONS[0] ?? null); setOpen(null); }} />
        <Button small label={`Characters (${CHARACTERS.length})`} disabled={busy} onPress={() => { setKind('characters'); setSession(CHARACTERS[0] ?? null); setOpen(null); }} />
      </Row>
      <Text style={styles.muted}>
        compiled {GENERATED_AT.slice(0, 16).replace('T', ' ')} · edit campaign/*.md and campaign/characters/*.md on the PC, rebuild, reinstall
      </Text>
      {inDoc && <Text style={[styles.body, {marginTop: 8}]}>Text boxes can only be inserted into a note. Open your campaign note first.</Text>}
      {status && <Text style={[styles.body, {marginTop: 8}]}>{status}</Text>}
      {error && (
        <Text style={styles.error} selectable>
          {error}
        </Text>
      )}

      {list.length === 0 && (
        <Text style={[styles.body, {marginTop: 12}]}>
          {kind === 'sessions' ? 'No scripts yet. Add a Markdown file under campaign/ and rebuild.' : 'No characters yet. Add a Markdown file under campaign/characters/ and rebuild.'}
        </Text>
      )}

      {list.length > 1 && (
        <Row>
          {list.map(s => (
            <Button
              small
              key={`${kind}-${s.number}`}
              label={kind === 'sessions' ? `S${s.number}` : s.title.replace(/^Character:\s*/i, '').split(/\s/)[0]}
              disabled={busy}
              onPress={() => { setSession(s); setOpen(null); }}
            />
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
            label={kind === 'sessions' ? 'Insert whole session as new pages' : 'Insert character as new pages'}
            hint={`${session.intro.length ? 'intro page + ' : ''}${session.scenes.length} page(s) after the page you have open`}
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
