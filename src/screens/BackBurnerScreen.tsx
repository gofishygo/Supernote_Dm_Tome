/** The task board, read from the open note's keywords. */
import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';
import {PluginCommAPI, PluginManager} from 'sn-plugin-lib';
import {ensureRead, ensureWrite} from '../permissions';
import {Board, bucket, findSessionKeyword, loadBoard, setDone, setSession, Task} from '../tasks';
import {Button, Row, styles} from '../ui';

const ORDER = ['overdue', 'due', 'upcoming', 'someday', 'done'] as const;
const TITLES: Record<(typeof ORDER)[number], string> = {
  overdue: 'Overdue',
  due: 'Due this session',
  upcoming: 'Upcoming',
  someday: 'Someday',
  done: 'Done',
};

export function BackBurnerScreen(): React.JSX.Element {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureRead();
      setBoard(await loadBoard());
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const withWrite = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await ensureWrite();
        await fn();
        setBoard(await loadBoard());
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const bumpSession = (delta: number) =>
    withWrite(async () => {
      if (!board) {
        return;
      }
      const loc = await findSessionKeyword(board.path);
      await setSession(board.path, loc, Math.max(1, board.session + delta));
    });

  const go = async (task: Task) => {
    try {
      await PluginCommAPI.jumpToPage(task.page);
      await PluginManager.closePluginView();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  };

  const groups: Record<string, Task[]> = {};
  if (board) {
    for (const t of board.tasks) {
      const b = bucket(t, board.session);
      (groups[b] ??= []).push(t);
    }
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => (a.due ?? 1e9) - (b.due ?? 1e9) || a.page - b.page);
    }
  }

  return (
    <ScrollView style={styles.screen}>
      <Row>
        <Text style={styles.h1}>Session {board?.session ?? '…'}</Text>
        <View style={{width: 16}} />
        <Button small label="−" disabled={busy || !board} onPress={() => bumpSession(-1)} />
        <Button small label="+" disabled={busy || !board} onPress={() => bumpSession(1)} />
        <View style={{width: 16}} />
        <Button small label="Refresh" disabled={busy} onPress={refresh} />
      </Row>
      {board && (
        <Text style={styles.muted}>
          {board.tasks.length} tasks in {board.keywordCount} keywords · {board.path.split('/').pop()}
        </Text>
      )}
      {error && (
        <Text style={styles.error} selectable>
          {error}
        </Text>
      )}
      {board && board.tasks.length === 0 && (
        <Text style={[styles.body, {marginTop: 16}]}>
          No tasks yet. Handwrite one, lasso it, tap Capture in the lasso toolbar.
        </Text>
      )}
      {ORDER.map(key => {
        const list = groups[key] ?? [];
        if (list.length === 0) {
          return null;
        }
        if (key === 'done' && !showDone) {
          return (
            <View key={key}>
              <Text style={styles.h2}>{TITLES[key]} ({list.length})</Text>
              <Button small label="Show done" onPress={() => setShowDone(true)} />
            </View>
          );
        }
        return (
          <View key={key}>
            <Text style={styles.h2}>
              {TITLES[key]} ({list.length})
            </Text>
            {list.map(t => (
              <View key={`${t.page}-${t.index}`} style={{borderBottomWidth: 1, borderBottomColor: '#000', paddingVertical: 8}}>
                <Text style={[styles.body, t.done && {textDecorationLine: 'line-through'}]}>{t.text}</Text>
                <Row>
                  <Text style={[styles.muted, {marginRight: 12}]}>
                    {t.due === null ? 'someday' : `S${t.due}`} · p.{t.page + 1}
                  </Text>
                  <Button small label={t.done ? 'Undo' : 'Done'} disabled={busy} onPress={() => withWrite(() => setDone(board!.path, t, !t.done))} />
                  <Button small label="Go to page" disabled={busy} onPress={() => go(t)} />
                </Row>
              </View>
            ))}
          </View>
        );
      })}
      <View style={{height: 80}} />
    </ScrollView>
  );
}
