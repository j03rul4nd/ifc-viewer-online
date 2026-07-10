import type enCommon from '../locales/en/common.json';
import type enToolbar from '../locales/en/toolbar.json';
import type enValidation from '../locales/en/validation.json';
import type enViewer from '../locales/en/viewer.json';
import type enSidebar from '../locales/en/sidebar.json';
import type enLanding from '../locales/en/landing.json';
import type enMeasurement from '../locales/en/measurement.json';
import type enEditor from '../locales/en/editor.json';
import type enErrors from '../locales/en/errors.json';
import type enToasts from '../locales/en/toasts.json';
import type enTree from '../locales/en/tree.json';
import type enBlog from '../locales/en/blog.json';
import type enGeo from '../locales/en/geo.json';
import type enSolar from '../locales/en/solar.json';
import type enTour from '../locales/en/tour.json';
import type enClient from '../locales/en/client.json';
import type enIds from '../locales/en/ids.json';
import type enEir from '../locales/en/eir.json';
import type enInvite from '../locales/en/invite.json';
import type enCapture from '../locales/en/capture.json';
import type enVerify from '../locales/en/verify.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof enCommon;
      toolbar: typeof enToolbar;
      validation: typeof enValidation;
      viewer: typeof enViewer;
      sidebar: typeof enSidebar;
      landing: typeof enLanding;
      measurement: typeof enMeasurement;
      editor: typeof enEditor;
      errors: typeof enErrors;
      toasts: typeof enToasts;
      tree: typeof enTree;
      blog: typeof enBlog;
      geo: typeof enGeo;
      ids: typeof enIds;
      eir: typeof enEir;
      invite: typeof enInvite;
      capture: typeof enCapture;
      solar: typeof enSolar;
      tour: typeof enTour;
      client: typeof enClient;
      verify: typeof enVerify;
    };
  }
}
