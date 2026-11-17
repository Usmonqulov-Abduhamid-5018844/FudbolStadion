import { Action, Ctx, Update } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { I18nService } from 'nestjs-i18n';
import { ManagersService } from '../../managers/managers.service';
import { MyContext } from 'src/helpers/bot.sesion';
import {
  inviteDoneKb,
  managerCardKb,
  managersListKb,
  managerStadionsKb,
  pickStadionsKb,
} from 'src/managers/managers.keyboard';
import { UtilisService } from 'src/utils/utile.service';
import { ErrorContext } from 'src/helpers/interface/enum';
import { OwnersService } from 'src/owners/owners.service';

@Update()
export class OwnerManagersUpdate {
  constructor(
    private readonly managers: ManagersService,
    private readonly i18n: I18nService,
    private readonly utils: UtilisService,
    private readonly ownerService: OwnersService,
  ) {}

  // ───────────── Yordamchilar ─────────────

  private async tr(ctx: MyContext) {
    const lang = (await this.utils.langs(ctx)) ?? 'uz';
    return (key: string, args?: Record<string, string | number>): string =>
      this.i18n.t(key, { lang, args });
  }

  // Faqat owner (menejer emas)
  private ownerId(ctx: MyContext): number | null {
    const a = ctx.actor;
    return a && !a.isManager ? a.ownerId : null;
  }

  private param(ctx: MyContext, index: number): string {
    const data =
      ctx.callbackQuery && 'data' in ctx.callbackQuery
        ? ctx.callbackQuery.data
        : '';
    return data.split('_')[index] ?? '';
  }

  // Telegram HTML uchun himoya (ism, stadion nomida < & bo'lishi mumkin)
  private esc(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Edit ishlamasa, yangi xabar yuboradi
  private async show(
    ctx: MyContext,
    text: string,
    kb: ReturnType<typeof Markup.inlineKeyboard>,
  ): Promise<void> {
    try {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
    } catch {
      await ctx.reply(text, { parse_mode: 'HTML', ...kb });
    }
  }

  private async deny(ctx: MyContext): Promise<void> {
    const t = await this.tr(ctx);
    await ctx.answerCbQuery(t('common.no_permission'), { show_alert: true });
  }

  // ───────────── Ekranlarni chizish ─────────────

  private async renderList(
    ctx: MyContext,
    ownerId: number,
    page: number,
  ): Promise<void> {
    const t = await this.tr(ctx);
    const {
      items,
      page: safePage,
      pages,
    } = await this.managers.listManagers(ownerId, page);

    const body = items.length ? t('manager.list_hint') : t('manager.empty');
    await this.show(
      ctx,
      `${t('manager.title')}\n\n${body}`,
      managersListKb(t, safePage, pages, items),
    );
  }

  private async renderCard(
    ctx: MyContext,
    ownerId: number,
    managerId: number,
    page: number,
  ): Promise<void> {
    const t = await this.tr(ctx);
    const m = await this.managers.getManagerCard(ownerId, managerId);

    if (!m) {
      await ctx
        .answerCbQuery(t('manager.not_found'), { show_alert: true })
        .catch(() => undefined);
      await this.renderList(ctx, ownerId, page);
      return;
    }

    const stadions = m.stadions.length
      ? m.stadions
          .map((s) => `🔹 <b>${this.esc(s.stadion.name)}</b>`)
          .join('\n')
      : t('manager.no_stadions');
      
    const text = t('manager.card', {
      name: `<a href="tg://user?id=${m.telegramId}">${this.esc(m.name)}</a>`,
      phone: m.phone ? `<code>${this.esc(m.phone)}</code>` : '—',
      date: m.createdAt.toLocaleDateString('ru-RU', {
        timeZone: 'Asia/Tashkent',
      }),
      handled: m.handled,
      status: m.isPaused
        ? t('manager.status_paused')
        : t('manager.status_active'),
      stadions,
    });

    await this.show(ctx, text, managerCardKb(t, m.id, page, m.isPaused));
  }

  private async renderStadions(
    ctx: MyContext,
    ownerId: number,
    managerId: number,
    page: number,
    markupOnly: boolean,
  ): Promise<void> {
    const t = await this.tr(ctx);
    const m = await this.managers.getManagerCard(ownerId, managerId);

    if (!m) {
      await ctx
        .answerCbQuery(t('manager.not_found'), { show_alert: true })
        .catch(() => undefined);
      await this.renderList(ctx, ownerId, page);
      return;
    }

    const all = await this.managers.getOwnerStadions(ownerId);
    const attached = m.stadions.map((s) => s.stadion.id);
    const kb = managerStadionsKb(t, all, attached, m.id, page);

    if (markupOnly) {
      try {
        await ctx.editMessageReplyMarkup(kb.reply_markup);
      } catch (error) {
        // Tez ikki marta bosilganda Telegram "message is not modified" beradi, bu xato emas
        if (!String(error).includes('message is not modified')) throw error;
      }
      return;
    }

    await this.show(
      ctx,
      t('manager.stadions_title', { name: this.esc(m.name) }),
      kb,
    );
  }

  // ───────────── 1) Ro'yxat ─────────────

  @Action(/^ownMgr_list_\d+$/)
  async onList(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const ownerId = this.ownerId(ctx);
      if (!ownerId) return await this.deny(ctx);

      await this.renderList(ctx, ownerId, Number(this.param(ctx, 2)) || 1);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  // ───────────── 2) Menejer qo'shish ─────────────

  @Action('ownMgr_add')
  async onAdd(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const ownerId = this.ownerId(ctx);
      if (!ownerId) return await this.deny(ctx);

      const t = await this.tr(ctx);
      const stadions = await this.managers.getOwnerStadions(ownerId);
      if (stadions.length === 0) {
        await ctx.reply(t('manager.no_stadion'));
        return;
      }

      ctx.session.managerPick = [];
      await this.show(
        ctx,
        t('manager.pick_stadions'),
        pickStadionsKb(t, stadions, []),
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^ownMgr_pick_\d+$/)
  async onPick(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const ownerId = this.ownerId(ctx);
      if (!ownerId) return await this.deny(ctx);

      const stadionId = Number(this.param(ctx, 2));
      const stadions = await this.managers.getOwnerStadions(ownerId);
      if (!stadions.some((s) => s.id === stadionId)) return;

      const current = ctx.session.managerPick ?? []; 
      ctx.session.managerPick = current.includes(stadionId)
        ? current.filter((id) => id !== stadionId)
        : [...current, stadionId];

      const kb = pickStadionsKb(
        await this.tr(ctx),
        stadions,
        ctx.session.managerPick,
      );
      await ctx.editMessageReplyMarkup(kb.reply_markup);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action('ownMgr_done')
  async onDone(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const ownerId = this.ownerId(ctx);
      if (!ownerId) return await this.deny(ctx);

      const t = await this.tr(ctx);
      const picked = ctx.session.managerPick ?? [];
      if (picked.length === 0) {
        await ctx.answerCbQuery(t('manager.pick_at_least_one'), {
          show_alert: true,
        });
        return;
      }

      const link = await this.managers.createInvite(ownerId, picked);
      ctx.session.managerPick = [];

      // Avval havola, keyin tanlash xabarini o'chiramiz (xato bo'lsa tanlash ekrani qoladi)
      await ctx.reply(t('manager.invite_created', { link }), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...inviteDoneKb(t),
      });
      await ctx.deleteMessage().catch(() => undefined);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  // ───────────── 3) Menejer kartasi ─────────────

  @Action(/^ownMgr_view_\d+_\d+$/)
  async onView(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const ownerId = this.ownerId(ctx);
      if (!ownerId) return await this.deny(ctx);

      await this.renderCard(
        ctx,
        ownerId,
        Number(this.param(ctx, 2)),
        Number(this.param(ctx, 3)) || 1,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  // ───────────── 4) Stadionlarni boshqarish ─────────────

  @Action(/^ownMgr_stad_\d+_\d+$/)
  async onStadions(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const ownerId = this.ownerId(ctx);
      if (!ownerId) return await this.deny(ctx);

      await this.renderStadions(
        ctx,
        ownerId,
        Number(this.param(ctx, 2)),
        Number(this.param(ctx, 3)) || 1,
        false,
      );
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  @Action(/^ownMgr_tog_\d+_\d+_\d+$/)
  async onToggleStadion(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const ownerId = this.ownerId(ctx);
      if (!ownerId) return await this.deny(ctx);

      const managerId = Number(this.param(ctx, 2));
      const stadionId = Number(this.param(ctx, 3));
      const page = Number(this.param(ctx, 4)) || 1;

      const ok = await this.managers.toggleStadion(
        ownerId,
        managerId,
        stadionId,
      );
      if (!ok) return; // begona ID, jim o'tkazamiz

      await this.renderStadions(ctx, ownerId, managerId, page, true);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  // ───────────── 5) To'xtatish / qayta yoqish ─────────────

  @Action(/^ownMgr_(pause|resume)_\d+_\d+$/)
  async onPause(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const ownerId = this.ownerId(ctx);
      if (!ownerId) return await this.deny(ctx);

      const paused = this.param(ctx, 1) === 'pause';
      const managerId = Number(this.param(ctx, 2));
      const page = Number(this.param(ctx, 3)) || 1;

      await this.managers.setPaused(ownerId, managerId, paused);
      await this.renderCard(ctx, ownerId, managerId, page);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  // ───────────── 6) O'chirish (tasdiqlashsiz) ─────────────

  @Action(/^ownMgr_del_\d+_\d+$/)
  async onDelete(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const ownerId = this.ownerId(ctx);
      if (!ownerId) return await this.deny(ctx);

      const t = await this.tr(ctx);
      const managerId = Number(this.param(ctx, 2));
      const page = Number(this.param(ctx, 3)) || 1;

      const removed = await this.managers.removeManager(ownerId, managerId);
      await ctx
        .answerCbQuery(removed ? t('manager.deleted') : t('manager.not_found'))
        .catch(() => undefined);

      // Menejerga xabar. Bot bloklangan bo'lsa ham o'chirish bekor bo'lmaydi
      if (removed) {
        const notice: string = this.i18n.t('manager.removed_notice', {
          lang: removed.lang,
        });
        try {
          await ctx.telegram.sendMessage(removed.telegramId, notice);
        } catch {
          // menejer botni bloklagan bo'lishi mumkin
        }
      }

      await this.renderList(ctx, ownerId, page);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }

  // ───────────── 7) Boshqa ─────────────

  // Sahifa raqami tugmasi bosilganda "soat" aylanmasligi uchun
  @Action('ownMgr_noop')
  async onNoop(@Ctx() ctx: MyContext): Promise<void> {
    await ctx.answerCbQuery().catch(() => undefined);
  }

  // Ro'yxatdan chiqish. Menejerlar bo'limi boshqa joyga ko'chirilgani uchun
  // qaytish joyini o'zingiz belgilang (pastdagi izohga qarang)
  @Action('ownMgr_back')
  async onBack(@Ctx() ctx: MyContext): Promise<void> {
    try {
      const ownerId = this.ownerId(ctx);
      if (!ownerId) return await this.deny(ctx);

      const lang = (await this.utils.langs(ctx)) ?? 'uz';

      await this.ownerService.ownerSettings(ctx, lang);
      await ctx.deleteMessage().catch(() => undefined);
    } catch (error) {
      await this.utils.errorFunction(ctx, error, ErrorContext.OWNER);
    } finally {
      await ctx.answerCbQuery().catch(() => undefined);
    }
  }
}
