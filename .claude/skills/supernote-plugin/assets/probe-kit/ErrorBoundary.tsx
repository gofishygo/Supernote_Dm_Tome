import React from 'react';
import {ScrollView, StyleSheet, Text} from 'react-native';
import {recordError} from './crashLog';

type Props = {children: React.ReactNode};
type State = {error: Error | null};

/** Renders a render-phase exception as text instead of a blank screen. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  componentDidCatch(error: Error): void {
    recordError(error, true);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <ScrollView style={styles.box}>
          <Text style={styles.title}>Plugin crashed while rendering</Text>
          <Text style={styles.mono} selectable>
            {String(this.state.error.message)}
            {'\n\n'}
            {String(this.state.error.stack ?? '')}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  box: {flex: 1, backgroundColor: '#ffffff', padding: 24},
  title: {fontSize: 26, fontWeight: '700', color: '#000000', marginBottom: 12},
  mono: {fontSize: 18, color: '#000000', fontFamily: 'monospace'},
});
