import { AdminLayout } from "../../components/admin/AdminLayout";
import { LocalizedCarouselEditor } from "../../features/content-publication/LocalizedCarouselEditor";

export function CarouselPage() {
  return (
    <AdminLayout>
      <LocalizedCarouselEditor
        scene="user-home"
        readPermission="page:backoffice-user-home-carousel"
        editPermission="button:backoffice-user-home-carousel-edit"
        publishPermission="button:backoffice-user-home-carousel-publish"
      />
    </AdminLayout>
  );
}
