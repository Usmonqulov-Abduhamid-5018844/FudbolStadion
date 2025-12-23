import { Markup } from 'telegraf';

export const helpMenuKeyboard = (i18n: any, lang: string) =>
  Markup.inlineKeyboard([
    [Markup.button.callback(i18n.translate('help.menu.about', { lang }), 'HELP_ABOUT')],
    [Markup.button.callback(i18n.translate('help.menu.start', { lang }), 'HELP_START')],
    [Markup.button.callback(i18n.translate('help.menu.booking', { lang }), 'HELP_BOOKING')],
    [Markup.button.callback(i18n.translate('help.menu.payment', { lang }), 'HELP_PAYMENT')],
    [Markup.button.callback(i18n.translate('help.menu.cancel', { lang }), 'HELP_CANCEL')],
    [Markup.button.callback(i18n.translate('help.menu.contact', { lang }), 'HELP_CONTACT')],
  ]);

  export const backKeyboard = (i18n: any, lang: string) =>
  Markup.inlineKeyboard([
    [Markup.button.callback(i18n.translate('schedule.back', { lang }), 'back_owner_1')],
  ]);
