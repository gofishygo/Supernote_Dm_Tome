/**
 * DM Tome - version 0.1 "SDK probe" console.
 *
 * E-ink rules of thumb used here:
 *  - pure black on white, no greys that would dither
 *  - big touch targets, no animation
 *  - state changes in batches so the panel redraws as little as possible
 *
 * @format
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
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

type Line = {label: string; text: string; ok: boolean};

const VERSION = '0.1.1';

async function runProbe(probe: Probe): Promise<Line> {
  try {
    const text = await probe.run();
    return {label: probe.label, text, ok: !text.startsWith('FAILED')};
  } catch (e) {
    return {label: probe.label, text: `THREW ${String(e)}`, ok: false};
  }
}

function Console(): React.JSX.Element {
  const [lines, setLines] = useState<Line[]>([]);
  const [crashCount, setCrashCount] = useState(getCrashLog().length);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<'console' | 'capture'>('console');
  const scroll = useRef<ScrollView>(null);

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

  // Remember which button opened us. Probes run only when tapped, so a
  // failing SDK call can never blank the first paint.
  useEffect(() => {
    const handle = (id: number | undefined) => {
      setMode(id === BUTTONS.CAPTURE ? 'capture' : 'console');
    };
    handle(getLastButton()?.id);
    return subscribeLastButton(ev => handle(ev.id));
  }, []);

  useEffect(() => subscribeCrashLog(() => setCrashCount(getCrashLog().length)), []);

  useEffect(() => {
    scroll.current?.scrollToEnd({animated: false});
  }, [lines]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <Text style={styles.title}>
          DM Tome {VERSION} · {mode === 'capture' ? 'Capture' : 'SDK probe'}
        </Text>
        <Pressable
          style={styles.closeButton}
          onPress={() => PluginManager.closePluginView()}>
          <Text style={styles.closeText}>Close ✕</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <ScrollView ref={scroll} style={styles.log}>
          <Text style={styles.lineLabel}>✓ Plugin UI rendered</Text>
          <Text style={styles.lineText}>
            Opened by button: {JSON.stringify(getLastButton())}
          </Text>
          {crashCount > 0 && (
            <View style={styles.crashBox}>
              <Text style={styles.lineLabel}>✗ {crashCount} captured error(s)</Text>
              {getCrashLog().map((c, i) => (
                <Text key={i} style={styles.lineText} selectable>
                  [{c.when}] {c.fatal ? 'FATAL ' : ''}{c.message}
                </Text>
              ))}
            </View>
          )}
          {lines.length === 0 && (
            <Text style={styles.muted}>
              Tap an action on the right. Start with "Run status probes".
            </Text>
          )}
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
          {busy && <Text style={styles.muted}>working: {busy}</Text>}
        </ScrollView>

        <ScrollView style={styles.actions}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <Pressable
            disabled={busy !== null}
            style={[styles.button, busy !== null && styles.buttonDisabled]}
            onPress={runStatus}>
            <Text style={styles.buttonText}>Run status probes</Text>
            <Text style={styles.buttonHint}>device, file, page, size, pen, paths</Text>
          </Pressable>
          {mode === 'capture' && (
            <Pressable
              disabled={busy !== null}
              style={[styles.button, busy !== null && styles.buttonDisabled]}
              onPress={runCapture}>
              <Text style={styles.buttonText}>Recognize lasso</Text>
              <Text style={styles.buttonHint}>unlocks: task capture</Text>
            </Pressable>
          )}
          {ACTION_PROBES.map(p => (
            <Pressable
              key={p.key}
              disabled={busy !== null}
              style={[styles.button, busy !== null && styles.buttonDisabled]}
              onPress={() => runAction(p)}>
              <Text style={styles.buttonText}>{p.label}</Text>
              <Text style={styles.buttonHint}>unlocks: {p.unlocks}</Text>
            </Pressable>
          ))}
          <Pressable
            disabled={busy !== null}
            style={[styles.button, busy !== null && styles.buttonDisabled]}
            onPress={() => setLines([])}>
            <Text style={styles.buttonText}>Clear log</Text>
          </Pressable>
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
  root: {flex: 1, backgroundColor: PAPER},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 3,
    borderBottomColor: INK,
  },
  title: {fontSize: 28, fontWeight: '700', color: INK},
  closeButton: {
    borderWidth: 3,
    borderColor: INK,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  closeText: {fontSize: 22, fontWeight: '700', color: INK},
  body: {flex: 1, flexDirection: 'row'},
  log: {flex: 3, padding: 20},
  actions: {
    flex: 2,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: INK,
  },
  sectionTitle: {fontSize: 22, fontWeight: '700', color: INK, marginBottom: 8},
  line: {marginBottom: 14},
  lineLabel: {fontSize: 22, fontWeight: '700', color: INK},
  lineText: {fontSize: 20, color: INK, fontFamily: 'monospace'},
  muted: {fontSize: 20, color: INK, fontStyle: 'italic'},
  crashBox: {borderWidth: 3, borderColor: INK, padding: 12, marginBottom: 14},
  button: {
    borderWidth: 3,
    borderColor: INK,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: PAPER,
  },
  buttonDisabled: {opacity: 0.4},
  buttonText: {fontSize: 22, fontWeight: '700', color: INK},
  buttonHint: {fontSize: 16, color: INK, marginTop: 4},
});

export default App;
