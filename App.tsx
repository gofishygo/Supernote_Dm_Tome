/**
 * DM Tome - version 0.2.0, the probe console.
 *
 * Step 2: the view is known to mount (0.1.2), so this screen brings back one
 * button per SDK primitive the DM features depend on. Nothing runs on mount;
 * every probe is a tap, and every result is printed in monospace so it can
 * be photographed or transcribed.
 *
 * @format
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {BUTTONS} from './src/buttons';
import {getCrashLog, subscribeCrashLog} from './src/crashLog';
import {ErrorBoundary} from './src/ErrorBoundary';
import {getLastButton, subscribeLastButton} from './src/lastButton';
import {
  ACTION_PROBES,
  Probe,
  recognizeLasso,
  STATUS_PROBES,
} from './src/probes';

const VERSION = '0.2.0';

type Line = {label: string; text: string; ok: boolean};

async function runProbe(probe: Probe): Promise<Line> {
  try {
    const text = await probe.run();
    return {label: probe.label, text, ok: !text.startsWith('FAILED')};
  } catch (e) {
    return {label: probe.label, text: `THREW ${String(e)}`, ok: false};
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

  const append = useCallback((line: Line) => {
    setLines(prev => [...prev, line]);
  }, []);

  const runStatus = useCallback(async () => {
    setBusy('status');
    const results: Line[] = [];
    for (const p of STATUS_PROBES) {
      results.push(await runProbe(p));
    }
    setLines(prev => [...prev, ...results]);
    setBusy(null);
  }, []);

  const runCapture = useCallback(async () => {
    setBusy('capture');
    try {
      append({label: 'Recognize lasso', text: await recognizeLasso(), ok: true});
    } catch (e) {
      append({label: 'Recognize lasso', text: `THREW ${String(e)}`, ok: false});
    }
    setBusy(null);
  }, [append]);

  const runAction = useCallback(
    async (probe: Probe) => {
      setBusy(probe.key);
      append(await runProbe(probe));
      setBusy(null);
    },
    [append],
  );

  const openedByLasso = button?.id === BUTTONS.CAPTURE;
  const disabled = busy !== null;

  return (
    <View style={[styles.root, {width, height}]}>
      <View style={styles.header}>
        <Text style={styles.title}>
          DM Tome {VERSION} · {openedByLasso ? 'Capture' : 'Probe console'}
        </Text>
        <Pressable
          style={styles.closeButton}
          onPress={() => PluginManager.closePluginView()}>
          <Text style={styles.closeText}>Close ✕</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <ScrollView ref={log} style={styles.log}>
          <Text style={styles.lineLabel}>✓ View mounted</Text>
          <Text style={styles.lineText}>
            window {Math.round(width)}×{Math.round(height)} dp · errors {crashes}
          </Text>
          <Text style={styles.lineText} selectable>
            button event: {JSON.stringify(button)}
          </Text>
          {getCrashLog().map((c, i) => (
            <Text key={`c${i}`} style={styles.lineText} selectable>
              ✗ [{c.when}] {c.message}
            </Text>
          ))}
          {lines.map((l, i) => (
            <View key={i} style={styles.line}>
              <Text style={styles.lineLabel}>
                {l.ok ? '✓' : '✗'} {l.label}
              </Text>
              <Text style={styles.lineText} selectable>
                {l.text}
              </Text>
            </View>
          ))}
          {busy && <Text style={styles.muted}>working: {busy}…</Text>}
          <View style={styles.spacer} />
        </ScrollView>

        <ScrollView style={styles.actions}>
          <Text style={styles.sectionTitle}>Probes</Text>
          <Pressable
            disabled={disabled}
            style={[styles.button, disabled && styles.buttonDisabled]}
            onPress={runStatus}>
            <Text style={styles.buttonText}>Run status probes</Text>
            <Text style={styles.buttonHint}>device, file, page, size, pen, paths</Text>
          </Pressable>
          {openedByLasso && (
            <Pressable
              disabled={disabled}
              style={[styles.button, disabled && styles.buttonDisabled]}
              onPress={runCapture}>
              <Text style={styles.buttonText}>Recognize lasso</Text>
              <Text style={styles.buttonHint}>unlocks: task capture</Text>
            </Pressable>
          )}
          {ACTION_PROBES.map(p => (
            <Pressable
              key={p.key}
              disabled={disabled}
              style={[styles.button, disabled && styles.buttonDisabled]}
              onPress={() => runAction(p)}>
              <Text style={styles.buttonText}>{p.label}</Text>
              <Text style={styles.buttonHint}>unlocks: {p.unlocks}</Text>
            </Pressable>
          ))}
          <Pressable
            disabled={disabled}
            style={[styles.button, disabled && styles.buttonDisabled]}
            onPress={() => setLines([])}>
            <Text style={styles.buttonText}>Clear log</Text>
          </Pressable>
          <View style={styles.spacer} />
        </ScrollView>
      </View>
    </View>
  );
}

function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <Console />
    </ErrorBoundary>
  );
}

const INK = '#000000';
const PAPER = '#ffffff';

const styles = StyleSheet.create({
  root: {backgroundColor: PAPER},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 3,
    borderBottomColor: INK,
  },
  title: {fontSize: 26, fontWeight: '700', color: INK},
  closeButton: {
    borderWidth: 3,
    borderColor: INK,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  closeText: {fontSize: 20, fontWeight: '700', color: INK},
  body: {flex: 1, flexDirection: 'row'},
  log: {flex: 3, paddingHorizontal: 20, paddingTop: 12},
  actions: {
    flex: 2,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: INK,
  },
  sectionTitle: {fontSize: 20, fontWeight: '700', color: INK, marginBottom: 8},
  line: {marginTop: 12},
  lineLabel: {fontSize: 19, fontWeight: '700', color: INK},
  lineText: {fontSize: 16, color: INK, fontFamily: 'monospace'},
  muted: {fontSize: 17, color: INK, fontStyle: 'italic', marginTop: 12},
  spacer: {height: 80},
  button: {
    borderWidth: 3,
    borderColor: INK,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: PAPER,
  },
  buttonDisabled: {opacity: 0.4},
  buttonText: {fontSize: 18, fontWeight: '700', color: INK},
  buttonHint: {fontSize: 14, color: INK, marginTop: 2},
});

export default App;
