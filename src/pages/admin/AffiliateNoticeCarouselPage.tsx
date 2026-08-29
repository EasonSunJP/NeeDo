import { AdminLayout } from "../../components/admin/AdminLayout";
import { AnnouncementEditor } from "../../features/content-publication/AnnouncementEditor";
import { LocalizedCarouselEditor } from "../../features/content-publication/LocalizedCarouselEditor";

export function AffiliateNoticeCarouselPage() {
  return (
    <AdminLayout>
      <LocalizedCarouselEditor
        scene="affiliate-home-notice"
        readPermission="page:backoffice-affiliate-notice-carousel"
        editPermission="button:backoffice-affiliate-notice-carousel-edit"
        publishPermission="button:backoffice-affiliate-notice-carousel-publish"
        announcementEditor={
          <AnnouncementEditor
            readPermission="page:backoffice-affiliate-announcement"
            editPermission="button:backoffice-affiliate-announcement-edit"
            publishPermission="button:backoffice-affiliate-announcement-publish"
          />
        }
      />
    </AdminLayout>
  );
}
