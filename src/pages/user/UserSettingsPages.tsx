import {
  UnifiedSettingsAboutPage,
  UnifiedSettingsAccountPage,
  UnifiedSettingsDeleteAccountPage,
  UnifiedSettingsHelpPage,
  UnifiedSettingsLanguagePage,
  UnifiedSettingsNotificationsPage,
  UnifiedSettingsPage,
  UnifiedSettingsPortalPage,
  UnifiedSettingsPrivacyPage,
  UnifiedSettingsProfileCardBackgroundPage,
  UnifiedSettingsProfilePage,
  UnifiedSettingsServiceRangePage,
  UnifiedSettingsThemePage,
  UnifiedSettingsTermsPage,
  UnifiedSettingsVerificationPage
} from "../../features/settings/UnifiedSettingsPages";
import { NdpGuidePage } from "./NdpGuidePage";

export function UserSettingsPage() {
  return <UnifiedSettingsPage portal="user" />;
}

export function UserSettingsThemePage() {
  return <UnifiedSettingsThemePage portal="user" />;
}

export function UserSettingsLanguagePage() {
  return <UnifiedSettingsLanguagePage portal="user" />;
}

export function UserSettingsPortalPage() {
  return <UnifiedSettingsPortalPage portal="user" />;
}

export function UserSettingsProfilePage() {
  return <UnifiedSettingsProfilePage portal="user" />;
}

export function UserSettingsProfileCardBackgroundPage() {
  return <UnifiedSettingsProfileCardBackgroundPage portal="user" />;
}

export function UserSettingsVerificationPage() {
  return <UnifiedSettingsVerificationPage portal="user" />;
}

export function UserSettingsServiceRangePage() {
  return <UnifiedSettingsServiceRangePage portal="user" />;
}

export function UserSettingsAccountPage() {
  return <UnifiedSettingsAccountPage portal="user" />;
}

export function UserSettingsNotificationsPage() {
  return <UnifiedSettingsNotificationsPage portal="user" />;
}

export function UserSettingsHelpPage() {
  return <UnifiedSettingsHelpPage portal="user" />;
}

export function UserSettingsAboutPage() {
  return <UnifiedSettingsAboutPage portal="user" />;
}

export function UserSettingsTermsPage() {
  return <UnifiedSettingsTermsPage portal="user" />;
}

export function UserSettingsPrivacyPage() {
  return <UnifiedSettingsPrivacyPage portal="user" />;
}

export function UserSettingsNdpGuidePage() {
  return <NdpGuidePage />;
}

export function UserSettingsDeleteAccountPage() {
  return <UnifiedSettingsDeleteAccountPage portal="user" />;
}
