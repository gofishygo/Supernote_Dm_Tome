/** The prep board, read from the open note's keywords. */
import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';
import {PluginCommAPI, PluginManager} from 'sn-plugin-lib';
import {ensureRead, ensureWrite} from '../permissions';
import {Board, bucket, Bucket, findSessionKeyword, loadBoard, rewriteTask, setSession, Task, TYPE_META} from '../tasks';
import {Button, Row, styles} from '../ui';

const ORDER: Bucket[] = ['strongNow', 'overdue', 'due', 'always', 'upcoming', 'someday', 'done'];
const TITLES: Record<Bucket, string> = {
  strongNow: 'Strong start',
  overdue: 'Overdue',
  due: 'Due this session',
  always: 'Always on',
  upcoming: 'Upcoming',
  someday: 'Someday',
  done: 'Done',
};

function byTypeThenDue(a: Task, b: Task): number {
  return TYPE_META[a.type].order - TYPE_META[b.type].order || (a.due ?? 1e9) - (b.due ?? 1e9) || a.page - b.page;
}

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

  const withWrite = useCallback(async (fn: () => Promise<void>) => {
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
  }, []);

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

  const groups: Partial<Record<Bucket, Task[]>> = {};
  if (board) {
    for (const t of board.tasks) {
      (groups[bucket(t, board.session)] ??= []).push(t);
    }
    for (const list of Object.values(groups)) {
      list.sort(byTypeThenDue);
    }
  }

  const renderTask = (t: Task, b: Bucket) => {
    const dated = TYPE_META[t.type].dated;
    const path = board!.path;
    return (
      <View key={`${t.page}-${t.index}`} style={{borderBottomWidth: 1, borderBottomColor: '#000', paddingVertical: 8}}>
        <Text style={[styles.body, t.done && {textDecorationLine: 'line-through'}]}>
          {b === 'due' || b === 'overdue' || b === 'upcoming' || b === 'done' || b === 'someday' ? `${TYPE_META[t.type].label}: ` : ''}
          {t.text}
        </Text>
        <Row>
          <Text style={[styles.muted, {marginRight: 12}]}>
            {dated ? (t.due === null ? 'someday' : `S${t.due}`) : TYPE_META[t.type].label} · p.{t.page + 1}
          </Text>
          <Button
            small
            label={t.done ? 'Undo' : dated ? 'Done' : 'Retire'}
            disabled={busy}
            onPress={() => withWrite(() => rewriteTask(path, t, {done: !t.done}))}
          />
          {dated && !t.done && (
            <Button small label="Push +1" disabled={busy} onPress={() => withWrite(() => rewriteTask(path, t, {due: (t.due ?? board!.session) + 1}))} />
          )}
          <Button small label="Go to page" disabled={busy} onPress={() => go(t)} />
        </Row>
      </View>
    );
  };

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
          {board.tasks.length} entries in {board.keywordCount} keywords · {board.path.split('/').pop()}
        </Text>
      )}
      {error && (
        <Text style={styles.error} selectable>
          {error}
        </Text>
      )}
      {board && board.tasks.length === 0 && (
        <Text style={[styles.body, {marginTop: 16}]}>
          Nothing yet. Handwrite something, lasso it, tap Capture in the lasso toolbar.
        </Text>
      )}

      {board && !(groups.strongNow?.length) && (
        <View style={{borderWidth: 3, borderColor: '#000', padding: 12, marginTop: 12}}>
          <Text style={styles.h2}>Strong start</Text>
          <Text style={styles.body}>No strong start for session {board.session} yet. Capture one as "Strong start".</Text>
        </View>
      )}

      {ORDER.map(key => {
        const list = groups[key] ?? [];
        if (list.length === 0) {
          return null;
        }
        if (key === 'done' && !showDone) {
          return (
            <View key={key}>
              <Text style={styles.h2}>
                {TITLES[key]} ({list.length})
              </Text>
              <Button small label="Show done" onPress={() => setShowDone(true)} />
            </View>
          );
        }
        const boxed = key === 'strongNow';
        return (
          <View key={key} style={boxed ? {borderWidth: 3, borderColor: '#000', padding: 12, marginTop: 12} : undefined}>
            <Text style={styles.h2}>
              {TITLES[key]} ({list.length})
            </Text>
            {list.map(t => renderTask(t, key))}
          </View>
        );
      })}
      <View style={{height: 80}} />
    </ScrollView>
  );
}
