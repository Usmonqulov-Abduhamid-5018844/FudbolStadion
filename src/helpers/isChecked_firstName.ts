export const isCkecked = (data?: string) => {
  if (!data) return false;
  if (data.length < 3) return false;
  let count = 0;
  let alfaCount = 0;
  for (let char of data) {
    let code = char.charCodeAt(0);

    const isAlfa = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);

    const isKril = code >= 1024 && code <= 1279;

    if (!isAlfa && !isKril) {
      count++;
    }
    alfaCount++;
  }
  if (count > alfaCount) {
    return false;
  }
  return true;
};
