import * as ImagePicker from 'expo-image-picker';
import { uploadFile } from '@/api/client';

/** Galereyadan rasm/video tanlab serverga yuklaydi. Bekor qilinsa — null. */
export async function pickAndUpload(kind: 'images' | 'all' = 'all') {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Galereyaga ruxsat berilmadi. Sozlamalardan ruxsat bering');
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === 'images' ? ['images'] : ['images', 'videos'],
    quality: 0.8,
    allowsEditing: kind === 'images',
    videoMaxDuration: 180,
  });
  if (r.canceled || !r.assets[0]) return null;
  return uploadFile(r.assets[0]);
}
