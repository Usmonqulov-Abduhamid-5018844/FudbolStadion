import { Markup } from 'telegraf';

const cb = (type: string) => JSON.stringify({ type });

export const helpMenuKeyboard_Owner = (i18n: any, lang: string) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(
        i18n.translate('help.help.menu.about', { lang }),
        cb('HELP_ABOUT'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('help.help.menu.start', { lang }),
        cb('HELP_START'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('help.help.menu.payment', { lang }),
        cb('HELP_PAYMENT'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('help.help.menu.cancel', { lang }),
        cb('HELP_CANCEL'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('help.help.menu.premium', { lang }),
        cb('HELP_PREMIUM'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('help.help.menu.advertisement', { lang }),
        cb('HELP_ADVERTISEMENT'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('help.help.menu.statistics', { lang }),
        cb('HELP_STATISTICS'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('help.help.menu.faq', { lang }),
        cb('HELP_FAQ'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('help.help.menu.contact', { lang }),
        cb('HELP_CONTACT'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('schedule.back', { lang }),
        'back_owner_1',
      ),
    ],
  ]);

export const back_owner_Keyboard = (i18n: any, lang: string) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(
        i18n.translate('schedule.back', { lang }),
        'back_owner_help',
      ),
    ],
  ]);
export const back_user_Keyboard = (i18n: any, lang: string) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(
        i18n.translate('schedule.back', { lang }),
        'back_user_help',
      ),
    ],
  ]);

export const helpMenuKeyboard_Users = (i18n: any, lang: string) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(
        i18n.translate('user_help.menu.booking', { lang }),
        cb('HELP_USER_BOOKING'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('user_help.menu.my_bookings', { lang }),
        cb('HELP_USER_MY_BOOKINGS'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('user_help.menu.how_booking', { lang }),
        cb('HELP_USER_HOW_BOOKING'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('user_help.menu.payment_penalty', { lang }),
        cb('HELP_USER_PAYMENT_PENALTY'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('user_help.menu.cancel', { lang }),
        cb('HELP_USER_CANCEL'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('user_help.menu.contact', { lang }),
        cb('HELP_USER_CONTACT'),
      ),
    ],
    [
      Markup.button.callback(
        i18n.translate('schedule.back', { lang }),
        'back_user_1',
      ),
    ],
  ]);
