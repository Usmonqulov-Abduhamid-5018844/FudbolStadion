import { PremiumReason } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';


export const  getPremiumReasonText =(
  reason: PremiumReason,
  i18n: I18nService,
  lang: string,
) => {
  switch (reason) {
    case PremiumReason.TRIAL:
      return i18n.translate('premium.premium_active.reason.trial', { lang });

    case PremiumReason.PURCHASE:
      return i18n.translate('premium.premium_active.reason.purchase', { lang });

    case PremiumReason.GIFT:
      return i18n.translate('premium.premium_active.reason.gift', { lang });

    case PremiumReason.COMPENSATION:
      return i18n.translate('premium.premium_active.reason.compensation', { lang });

    default:
      return '';
  }
}