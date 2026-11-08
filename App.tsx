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
import {getLastButton, subscribeLastButton} from './src/lastButton';
import {
  ACTION_PROBES,
  Probe,
  recognizeLasso,
  STATUS_PROBES,
} from './src/probes';

type Line = {label: string; text: string; ok: boolean};

const VERSION = '0.1.0';

async function runProbe(probe: Probe): Promise<Line> {
  try {
    const text = await probe.run();
    return {label: probe.label, text, ok: !text.startsWith('FAILED')};
  } catch (e) {
    return {label: probe.label, text: `THREW ${String(e)}`, ok: false};
  }
}

function App(): React.JSX.Element {
  const [lines, setLines] = useState<Line[]>([]);
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

  // Decide what to do from the button that opened us, now and on later presses.
  useEffect(() => {
    const handle = (id: number | undefined) => {
      if (id === BUTTONS.CAPTURE) {
        setMode('capture');
        runCapture();
      } else {
        setMode('console');
        runStatus();
      }
    };
    handle(getLastButton()?.id);
    return subscribeLastButton(ev => handle(ev.id));
  }, [runCapture, runStatus]);

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
          {lines.length === 0 && (
            <Text style={styles.muted}>Running probes…</Text>
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
          <Pressable
            disabled={busy !== null}
            style={[styles.button, busy !== null && styles.buttonDisabled]}
            onPress={runStatus}>
            <Text style={styles.buttonText}>Re-run status probes</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
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
