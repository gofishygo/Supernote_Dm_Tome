/** The SDK probe console from 0.2.x, now one tab of the hub. */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';
import {getCrashLog} from '../crashLog';
import {getLastButton} from '../lastButton';
import {ACTION_PROBES, Probe, recognizeLasso, STATUS_PROBES} from '../probes';
import {Button, styles} from '../ui';

type Line = {label: string; text: string; ok: boolean};

function detail(e: unknown): string {
  const o = e as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') {
    return String(e);
  }
  return ['name', 'code', 'message', 'userInfo']
    .filter(k => o[k] !== undefined)
    .map(k => `${k}=${typeof o[k] === 'string' ? o[k] : JSON.stringify(o[k])}`)
    .join(' ');
}

async function runProbe(probe: Probe): Promise<Line> {
  try {
    const text = await probe.run();
    return {label: probe.label, text, ok: !text.startsWith('FAILED')};
  } catch (e) {
    return {label: probe.label, text: `THREW ${detail(e)}`, ok: false};
  }
}

export function ProbeConsole(): React.JSX.Element {
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const log = useRef<ScrollView>(null);
  useEffect(() => {
    log.current?.scrollToEnd({animated: false});
  }, [lines]);

  const append = useCallback((line: Line) => setLines(prev => [...prev, line]), []);
  const run = useCallback(
    async (probe: Probe) => {
      setBusy(probe.key);
      append(await runProbe(probe));
      setBusy(null);
    },
    [append],
  );
  const capture = useCallback(async () => {
    setBusy('capture');
    try {
      append({label: 'Recognize lasso', text: await recognizeLasso(), ok: true});
    } catch (e) {
      append({label: 'Recognize lasso', text: `THREW ${detail(e)}`, ok: false});
    }
    setBusy(null);
  }, [append]);

  const disabled = busy !== null;
  return (
    <View style={{flex: 1, flexDirection: 'row'}}>
      <ScrollView ref={log} style={{flex: 3, paddingHorizontal: 20, paddingTop: 12}}>
        <Text style={styles.mono} selectable>
          button event: {JSON.stringify(getLastButton())} · errors {getCrashLog().length}
        </Text>
        {getCrashLog().map((c, i) => (
          <Text key={`c${i}`} style={styles.mono} selectable>
            ✗ [{c.when}] {c.message}
          </Text>
        ))}
        {lines.map((l, i) => (
          <View key={i} style={{marginTop: 12}}>
            <Text style={styles.h2}>
              {l.ok ? '✓' : '✗'} {l.label}
            </Text>
            <Text style={styles.mono} selectable>
              {l.text}
            </Text>
          </View>
        ))}
        {busy && <Text style={styles.muted}>working: {busy}…</Text>}
        <View style={{height: 80}} />
      </ScrollView>
      <ScrollView style={{flex: 2, paddingHorizontal: 16, paddingTop: 12, borderLeftWidth: 3, borderLeftColor: '#000'}}>
        <Text style={styles.h2}>Status</Text>
        {STATUS_PROBES.map(p => (
          <Button key={p.key} label={p.label} hint={`unlocks: ${p.unlocks}`} disabled={disabled} onPress={() => run(p)} />
        ))}
        <Text style={styles.h2}>Actions</Text>
        <Button label="Recognize lasso" hint="needs an active lasso" disabled={disabled} onPress={capture} />
        {ACTION_PROBES.map(p => (
          <Button key={p.key} label={p.label} hint={`unlocks: ${p.unlocks}`} disabled={disabled} onPress={() => run(p)} />
        ))}
        <Button label="Clear log" disabled={disabled} onPress={() => setLines([])} />
        <View style={{height: 80}} />
      </ScrollView>
    </View>
  );
}
