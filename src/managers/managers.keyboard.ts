import { Markup } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/types';

type Translate = (key: string) => string;

const shorten = (text: string, max = 28): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export function pickStadionsKb(
  t: Translate,
  stadions: { id: number; name: string }[],
  selected: number[],
) {
  const rows = stadions.map((s) => [
    Markup.button.callback(
      `${selected.includes(s.id) ? '✅' : '⬜'} ${shorten(s.name)}`,
      `ownMgr_pick_${s.id}`,
    ),
  ]);
  rows.push([Markup.button.callback(t('manager.continue'), 'ownMgr_done')]);
  rows.push([Markup.button.callback(t('schedule.back'), 'ownMgr_list_1')]);
  return Markup.inlineKeyboard(rows);
}

export function inviteDoneKb(t: Translate) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t('schedule.back'), 'ownMgr_list_1')],
  ]);
}

type ManagerItem = {
  id: number;
  name: string;
  isPaused: boolean;
  _count: { stadions: number };
};

export function managersListKb(
  t: Translate,
  page: number,
  pages: number,
  items: ManagerItem[],
) {
  // Har bir menejer alohida tugma
  const rows: InlineKeyboardButton[][] = items.map((m) => [
    Markup.button.callback(
      `${m.isPaused ? '⏸' : '👔'} ${shorten(m.name)} · ${m._count.stadions}`,
      `ownMgr_view_${m.id}_${page}`,
    ),
  ]);

  rows.push([Markup.button.callback(t('manager.add'), 'ownMgr_add')]);

  if (pages > 1) {
    const nav: InlineKeyboardButton[] = [];
    if (page > 1) {
      nav.push(
        Markup.button.callback(
          t('stadions.Previous'),
          `ownMgr_list_${page - 1}`,
        ),
      );
    }
    nav.push(Markup.button.callback(`${page} / ${pages}`, 'ownMgr_noop'));
    if (page < pages) {
      nav.push(
        Markup.button.callback(t('stadions.Next'), `ownMgr_list_${page + 1}`),
      );
    }
    rows.push(nav);
  }

  rows.push([Markup.button.callback(t('schedule.back'), 'ownMgr_back')]);

  return Markup.inlineKeyboard(rows);
}

// Menejer kartasi
export function managerCardKb(
  t: Translate,
  managerId: number,
  page: number,
  paused: boolean,
) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        t('manager.manage_stadions'),
        `ownMgr_stad_${managerId}_${page}`,
      ),
    ],
    [
      paused
        ? Markup.button.callback(
            t('manager.resume'),
            `ownMgr_resume_${managerId}_${page}`,
          )
        : Markup.button.callback(
            t('manager.pause'),
            `ownMgr_pause_${managerId}_${page}`,
          ),
    ],
    [
      Markup.button.callback(
        t('manager.delete'),
        `ownMgr_del_${managerId}_${page}`,
      ),
    ],
    [Markup.button.callback(t('schedule.back'), `ownMgr_list_${page}`)],
  ]);
}

// Stadionlarni boshqarish
export function managerStadionsKb(
  t: Translate,
  stadions: { id: number; name: string }[],
  attachedIds: number[],
  managerId: number,
  page: number,
) {
  const rows: InlineKeyboardButton[][] = stadions.map((s) => [
    Markup.button.callback(
      `${attachedIds.includes(s.id) ? '✅' : '⬜'} ${shorten(s.name)}`,
      `ownMgr_tog_${managerId}_${s.id}_${page}`,
    ),
  ]);
  rows.push([
    Markup.button.callback(
      t('schedule.back'),
      `ownMgr_view_${managerId}_${page}`,
    ),
  ]);
  return Markup.inlineKeyboard(rows);
}
