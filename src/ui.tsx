/** Shared e-ink widgets: black on white, big targets, no animation. */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

export const INK = '#000000';
export const PAPER = '#ffffff';

export function Button({
  label,
  hint,
  onPress,
  disabled,
  small,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  small?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      disabled={disabled}
      style={[styles.button, small && styles.buttonSmall, disabled && styles.disabled]}
      onPress={onPress}>
      <Text style={[styles.buttonText, small && styles.buttonTextSmall]}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </Pressable>
  );
}

export function Row({children}: {children: React.ReactNode}): React.JSX.Element {
  return <View style={styles.row}>{children}</View>;
}

export const styles = StyleSheet.create({
  button: {
    borderWidth: 3,
    borderColor: INK,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    marginRight: 10,
    backgroundColor: PAPER,
  },
  buttonSmall: {paddingHorizontal: 10, paddingVertical: 8, marginBottom: 0},
  buttonText: {fontSize: 18, fontWeight: '700', color: INK},
  buttonTextSmall: {fontSize: 16},
  hint: {fontSize: 14, color: INK, marginTop: 2},
  disabled: {opacity: 0.4},
  row: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center'},
  h1: {fontSize: 26, fontWeight: '700', color: INK},
  h2: {fontSize: 20, fontWeight: '700', color: INK, marginTop: 16, marginBottom: 6},
  body: {fontSize: 18, color: INK},
  mono: {fontSize: 16, color: INK, fontFamily: 'monospace'},
  muted: {fontSize: 16, color: INK, fontStyle: 'italic'},
  error: {fontSize: 16, color: INK, fontFamily: 'monospace', borderWidth: 3, borderColor: INK, padding: 10, marginVertical: 8},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 3,
    borderBottomColor: INK,
  },
  tab: {borderWidth: 3, borderColor: INK, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8},
  tabActive: {backgroundColor: INK},
  tabText: {fontSize: 18, fontWeight: '700', color: INK},
  tabTextActive: {color: PAPER},
  screen: {flex: 1, paddingHorizontal: 24, paddingTop: 12},
});
