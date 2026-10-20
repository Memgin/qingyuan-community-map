/**
 * 图片选择与读取。
 *
 * 用系统图片选择器（photoAccessHelper.PhotoViewPicker）拿到 photoUri，
 * 再用 fileIo 以二进制方式读出内容，供 POST /api/uploads 直接上传
 * （后端接受原始二进制体 + Content-Type，最大 2MB）。
 *
 * 说明：系统选择器本身不需要 READ_IMAGEVIDEO 权限——它通过临时授权把
 * URI 交给应用，这也是这里不需要申请媒体读权限的原因。
 */
import { hilog } from '@kit.PerformanceAnalysisKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { fileIo as fs } from '@kit.CoreFileKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'QyMapImage';

/** 后端限制：单张图片不超过 2MB */
export const MAX_IMAGE_BYTES: number = 2 * 1024 * 1024;

export class PickedImage {
  uri: string = '';
  bytes: ArrayBuffer = new ArrayBuffer(0);
  size: number = 0;
  contentType: string = 'image/jpeg';
}

/** 根据文件后缀推断 MIME 类型（后端只接受 jpeg / png / webp） */
function contentTypeOf(path: string): string {
  const lower: string = path.toLowerCase();
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  return 'image/jpeg';
}

/**
 * 选择一张图片并读入内存。
 * - 用户取消：返回 null
 * - 图片过大：抛错，由页面提示
 */
export async function pickOneImage(): Promise<PickedImage | null> {
  const options = new photoAccessHelper.PhotoSelectOptions();
  options.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE;
  options.maxSelectNumber = 1;
  const picker = new photoAccessHelper.PhotoViewPicker();
  const result: photoAccessHelper.PhotoSelectResult = await picker.select(options);
  if (result.photoUris === undefined || result.photoUris.length === 0) {
    return null;
  }
  const uri: string = result.photoUris[0];
  const file: fs.File = fs.openSync(uri, fs.OpenMode.READ_ONLY);
  try {
    const stat: fs.Stat = fs.statSync(file.fd);
    if (stat.size > MAX_IMAGE_BYTES) {
      throw new Error('图片不能超过 2MB，请先压缩后再选择');
    }
    const buffer: ArrayBuffer = new ArrayBuffer(stat.size);
    const read: number = fs.readSync(file.fd, buffer);
    const image = new PickedImage();
    image.uri = uri;
    image.bytes = read === stat.size ? buffer : buffer.slice(0, read);
    image.size = read;
    image.contentType = contentTypeOf(uri);
    hilog.info(DOMAIN, TAG, 'picked image size=%{public}d type=%{public}s', read, image.contentType);
    return image;
  } finally {
    fs.closeSync(file);
  }
}
