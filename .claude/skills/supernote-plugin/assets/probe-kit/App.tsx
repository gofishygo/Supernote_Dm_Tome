/**
 * Probe console. Paints before any SDK call; one call per tap; prints raw
 * results and full error detail. Replace with your real UI once the probes
 * you depend on are green on the device.
 *
 * @format
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {BUTTONS} from './src/buttons';
import {getCrashLog, subscribeCrashLog} from './src/crashLog';
import {ErrorBoundary} from './src/ErrorBoundary';
import {getLastButton, subscribeLastButton} from './src/lastButton';
import {ACTION_PROBES, Probe, recognizeLasso, STATUS_PROBES} from './src/probes';

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

function Console(): React.JSX.Element {
  const {width, height} = useWindowDimensions();
  const [button, setButton] = useState(getLastButton());
  const [crashes, setCrashes] = useState(getCrashLog().length);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const log = useRef<ScrollView>(null);

  useEffect(() => subscribeLastButton(ev => setButton(ev)), []);
  useEffect(() => subscribeCrashLog(() => setCrashes(getCrashLog().length)), []);
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
  const openedByLasso = button?.id === BUTTONS.LASSO;

  return (
    <View style={[s.root, {width, height}]}>
      <View style={s.header}>
        <Text style={s.title}>Probe console · {openedByLasso ? 'lasso' : 'toolbar'}</Text>
        <Pressable style={s.close} onPress={() => PluginManager.closePluginView()}>
          <Text style={s.closeText}>Close ✕</Text>
        </Pressable>
      </View>
      <View style={s.body}>
        <ScrollView ref={log} style={s.log}>
          <Text style={s.label}>✓ View mounted</Text>
          <Text style={s.mono}>
            window {Math.round(width)}×{Math.round(height)} dp · errors {crashes}
          </Text>
          <Text style={s.mono} selectable>
            button event: {JSON.stringify(button)}
          </Text>
          {getCrashLog().map((c, i) => (
            <Text key={`c${i}`} style={s.mono} selectable>
              ✗ [{c.when}] {c.message}
            </Text>
          ))}
          {lines.map((l, i) => (
            <View key={i} style={s.line}>
              <Text style={s.label}>
                {l.ok ? '✓' : '✗'} {l.label}
              </Text>
              <Text style={s.mono} selectable>
                {l.text}
              </Text>
            </View>
          ))}
          {busy && <Text style={s.muted}>working: {busy}…</Text>}
          <View style={s.spacer} />
        </ScrollView>
        <ScrollView style={s.actions}>
          <Text style={s.section}>Status (one call each)</Text>
          {STATUS_PROBES.map(p => (
            <Pressable key={p.key} disabled={disabled} style={[s.button, disabled && s.disabled]} onPress={() => run(p)}>
              <Text style={s.buttonText}>{p.label}</Text>
              <Text style={s.hint}>unlocks: {p.unlocks}</Text>
            </Pressable>
          ))}
          <Text style={s.section}>Actions</Text>
          <Pressable disabled={disabled} style={[s.button, disabled && s.disabled]} onPress={capture}>
            <Text style={s.buttonText}>Recognize lasso</Text>
            <Text style={s.hint}>needs an active lasso selection</Text>
          </Pressable>
          {ACTION_PROBES.map(p => (
            <Pressable key={p.key} disabled={disabled} style={[s.button, disabled && s.disabled]} onPress={() => run(p)}>
              <Text style={s.buttonText}>{p.label}</Text>
              <Text style={s.hint}>unlocks: {p.unlocks}</Text>
            </Pressable>
          ))}
          <Pressable disabled={disabled} style={[s.button, disabled && s.disabled]} onPress={() => setLines([])}>
            <Text style={s.buttonText}>Clear log</Text>
          </Pressable>
          <View style={s.spacer} />
        </ScrollView>
      </View>
    </View>
  );
}

export default function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <Console />
    </ErrorBoundary>
  );
}

const INK = '#000000';
const PAPER = '#ffffff';
const s = StyleSheet.create({
  root: {backgroundColor: PAPER},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 3, borderBottomColor: INK},
  title: {fontSize: 26, fontWeight: '700', color: INK},
  close: {borderWidth: 3, borderColor: INK, paddingHorizontal: 20, paddingVertical: 10},
  closeText: {fontSize: 20, fontWeight: '700', color: INK},
  body: {flex: 1, flexDirection: 'row'},
  log: {flex: 3, paddingHorizontal: 20, paddingTop: 12},
  actions: {flex: 2, paddingHorizontal: 16, paddingTop: 12, borderLeftWidth: 3, borderLeftColor: INK},
  section: {fontSize: 20, fontWeight: '700', color: INK, marginBottom: 8, marginTop: 8},
  line: {marginTop: 12},
  label: {fontSize: 19, fontWeight: '700', color: INK},
  mono: {fontSize: 16, color: INK, fontFamily: 'monospace'},
  muted: {fontSize: 17, color: INK, fontStyle: 'italic', marginTop: 12},
  spacer: {height: 80},
  button: {borderWidth: 3, borderColor: INK, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10, backgroundColor: PAPER},
  disabled: {opacity: 0.4},
  buttonText: {fontSize: 18, fontWeight: '700', color: INK},
  hint: {fontSize: 14, color: INK, marginTop: 2},
});
