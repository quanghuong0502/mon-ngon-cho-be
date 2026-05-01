const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dhegj3fmm';
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'buacomchobe';

export const uploadToCloudinary = async (file: File, folder = 'buacomchobe') => {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error('Cloudinary configuration is missing');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.secure_url;
};

export const getOptimizedUrl = (url: string | undefined, width = 400) => {
  if (!url || !url.includes('cloudinary.com')) return url;
  // Use w_width, q_auto (automatic quality), f_auto (automatic format/WebP)
  return url.replace('/upload/', `/upload/w_${width},q_auto,f_auto/`);
};
