import { Markup } from 'telegraf';

const cb = (type: string) => JSON.stringify({ type });

export const helpMenuKeyboard = (i18n: any, lang: string) =>
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
  
  export const backKeyboard = (i18n: any, lang: string) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(
        i18n.translate('schedule.back', { lang }),
        'back_owner_help',
      ),
    ],
  ]);
  

  export const helpMenuKeyboard_Users = (i18n: any, lang: string) =>
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
          i18n.translate('help.help.menu.booking', { lang }),
          cb('HELP_BOOKING'),
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