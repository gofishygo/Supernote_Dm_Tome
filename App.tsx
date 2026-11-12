/**
 * DM Tome - 0.3.0. Lasso button → Capture screen. Toolbar button → hub with
 * Back Burner and Probes tabs. Everything renders black on white, sized to
 * the window, with no SDK call before the first paint.
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {Pressable, Text, useWindowDimensions, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {BUTTONS} from './src/buttons';
import {ErrorBoundary} from './src/ErrorBoundary';
import {getLastButton, subscribeLastButton} from './src/lastButton';
import {BackBurnerScreen} from './src/screens/BackBurnerScreen';
import {CaptureScreen} from './src/screens/CaptureScreen';
import {ProbeConsole} from './src/screens/ProbeConsole';
import {ReferenceScreen} from './src/screens/ReferenceScreen';
import {PAPER, styles} from './src/ui';

const VERSION = '0.4.8';
type Tab = 'tonight' | 'burner' | 'refs' | 'probes';

function Hub(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('tonight');
  return (
    <View style={{flex: 1}}>
      <View style={styles.header}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Text style={[styles.h1, {marginRight: 20}]}>DM Tome {VERSION}</Text>
          {(['tonight', 'burner', 'refs', 'probes'] as Tab[]).map(t => (
            <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'tonight' ? 'Tonight' : t === 'burner' ? 'Back Burner' : t === 'refs' ? 'References' : 'Probes'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.tab} onPress={() => PluginManager.closePluginView()}>
          <Text style={styles.tabText}>Close ✕</Text>
        </Pressable>
      </View>
      {tab === 'tonight' ? (
        <BackBurnerScreen mode="tonight" />
      ) : tab === 'burner' ? (
        <BackBurnerScreen mode="ledger" />
      ) : tab === 'refs' ? (
        <ReferenceScreen />
      ) : (
        <ProbeConsole />
      )}
    </View>
  );
}

function Root(): React.JSX.Element {
  const {width, height} = useWindowDimensions();
  const [button, setButton] = useState(getLastButton());
  useEffect(() => subscribeLastButton(ev => setButton(ev)), []);
  const capture = button?.id === BUTTONS.CAPTURE;
  return (
    <View style={{width, height, backgroundColor: PAPER}}>
      {capture ? (
        <View style={{flex: 1}}>
          <View style={styles.header}>
            <Text style={styles.h1}>DM Tome {VERSION}</Text>
            <Pressable style={styles.tab} onPress={() => PluginManager.closePluginView()}>
              <Text style={styles.tabText}>Close ✕</Text>
            </Pressable>
          </View>
          <CaptureScreen />
        </View>
      ) : (
        <Hub />
      )}
    </View>
  );
}

export default function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  );
}
