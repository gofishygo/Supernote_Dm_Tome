/**
 * DM Tome - version 0.1.2, deliberately minimal.
 *
 * Step 1 of building up from a known-good base: prove the plugin view mounts
 * and paints. No ScrollView, no flex: 1 chain, no SDK calls on mount. The
 * probe console in src/probes.ts comes back once this screen shows up.
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {getCrashLog, subscribeCrashLog} from './src/crashLog';
import {getLastButton, subscribeLastButton} from './src/lastButton';

const VERSION = '0.1.2';

function App(): React.JSX.Element {
  const {width, height} = useWindowDimensions();
  const [button, setButton] = useState(getLastButton());
  const [crashes, setCrashes] = useState(getCrashLog().length);

  useEffect(() => subscribeLastButton(ev => setButton(ev)), []);
  useEffect(() => subscribeCrashLog(() => setCrashes(getCrashLog().length)), []);

  return (
    <View style={[styles.root, {width, height}]}>
      <Text style={styles.title}>DM Tome {VERSION} is alive</Text>
      <Text style={styles.line}>
        window {Math.round(width)} × {Math.round(height)}
      </Text>
      <Text style={styles.line}>opened by: {JSON.stringify(button)}</Text>
      <Text style={styles.line}>captured errors: {crashes}</Text>
      {getCrashLog().map((c, i) => (
        <Text key={i} style={styles.mono} selectable>
          [{c.when}] {c.fatal ? 'FATAL ' : ''}
          {c.message}
        </Text>
      ))}
      <Pressable
        style={styles.button}
        onPress={() => PluginManager.closePluginView()}>
        <Text style={styles.buttonText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {backgroundColor: '#ffffff', padding: 32},
  title: {fontSize: 32, fontWeight: '700', color: '#000000', marginBottom: 16},
  line: {fontSize: 22, color: '#000000', marginBottom: 8},
  mono: {fontSize: 18, color: '#000000', fontFamily: 'monospace', marginBottom: 8},
  button: {
    marginTop: 24,
    alignSelf: 'flex-start',
    borderWidth: 3,
    borderColor: '#000000',
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  buttonText: {fontSize: 24, fontWeight: '700', color: '#000000'},
});

export default App;
