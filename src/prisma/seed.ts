import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
const regions = [
  {
    name: 'Toshkent',
    items: ['Chilonzor', 'Yunusobod', 'Olmazor', 'Yakkasaroy', 'Sergeli', 'Mirzo Ulugʻbek', 'Shayxontohur', 'Yashnobod', 'Uchtepa'],
  },
  {
    name: 'Andijon',
    items: ['Andijon shahri', 'Asaka', 'Baliqchi', 'Boʻston', 'Izboskan', 'Qoʻrgʻontepa', 'Xonobod', 'Paxtaobod', 'Shahrixon', 'Ulugʻnor', 'Xoʻjaobod'],
  },
  {
    name: 'Fargʻona',
    items: ['Fargʻona shahri', 'Qoʻqon', 'Margʻilon', 'Beshariq', 'Bagʻdod', 'Buvayda', 'Dangʻara', 'Furqat', 'Oltiariq', 'Oʻzbekiston', 'Rishton', 'Soʻx', 'Toshloq', 'Uchkoʻprik', 'Quva', 'Yozyovon'],
  },
  {
    name: 'Namangan',
    items: ['Namangan shahri', 'Chortoq', 'Chust', 'Kosonsoy', 'Mingbuloq', 'Namangan', 'Norin', 'Pop', 'Toshbuloq', 'Uchqoʻrgʻon', 'Uychi', 'Yangiqoʻrgʻon'],
  },
  {
    name: 'Samarqand',
    items: ['Samarqand shahri', 'Bulungʻur', 'Jomboy', 'Ishtixon', 'Kattaqoʻrgʻon', 'Narpay', 'Oqdaryo', 'Payariq', 'Pastdargʻom', 'Qoʻshrabot', 'Samarqand', 'Toyloq', 'Urgut', 'Paxtachi'],
  },
  {
    name: 'Buxoro',
    items: ['Buxoro shahri', 'Buxoro', 'Gʻijduvon', 'Jondor', 'Kogon', 'Peshku', 'Romitan', 'Shofirkon', 'Vobkent'],
  },
  {
    name: 'Xorazm',
    items: ['Urganch', 'Xiva', 'Bogʻot', 'Gurlan', 'Shovot', 'Xonqa', 'Hazorasp', 'Yangiariq', 'Urganch tumani'],
  },
  {
    name: 'Qashqadaryo',
    items: ['Qarshi', 'Chiroqchi', 'Gʻuzor', 'Dehqonobod', 'Koson', 'Kitob', 'Mirishkor', 'Shahrisabz', 'Yakkabogʻ', 'Muborak'],
  },
  {
    name: 'Surxondaryo',
    items: ['Termiz', 'Angor', 'Boysun', 'Denov', 'Jarqoʻrgʻon', 'Muzrabot', 'Sariosiyo', 'Sherobod', 'Shoʻrchi', 'Termiz tumani', 'Uzunobod'],
  },
  {
    name: 'Sirdaryo',
    items: ['Guliston', 'Boyovut', 'Yangiyer', 'Oqoltin', 'Sardoba', 'Sayxunobod', 'Shirin', 'Sirdaryo tumani', 'Xovos'],
  },
  {
    name: 'Jizzax',
    items: ['Jizzax shahri', 'Arnasoy', 'Baxmal', 'Doʻstlik', 'Forish', 'Gʻallaorol', 'Mirzachoʻl', 'Paxtakor', 'Sharof Rashidov', 'Yangiobod', 'Zarbdor'],
  },
  {
    name: 'Navoiy',
    items: ['Navoiy shahri', 'Karmana', 'Konimex', 'Navbahor', 'Nurota', 'Tomdi', 'Uchkuduk', 'Xatirchi', 'Qiziltepa'],
  },
  {
    name: 'Toshkent viloyati',
    items: ['Angren', 'Bekobod', 'Boʻka', 'Chirchiq', 'Ohangaron', 'Olmaliq', 'Parkent', 'Piskent', 'Quyichirchiq', 'Toshkent', 'Zangiota', 'Yangiyoʻl', 'Yuqori Chirchiq'],
  },
  {
    name: 'Qoraqalpogʻiston',
    items: ['Nukus', 'Amudaryo', 'Beruniy', 'Chimboy', 'Ellikqalʼa', 'Kegeyli', 'Moʻynoq', 'Nukus tumani', 'Qanlikoʻl', 'Qoʻngʻirot', 'Shumanay', 'Taxiatosh', 'Toʻrtkoʻl', 'Xoʻjayli', 'Xoʻjayli shahri', 'Taxtakoʻpir'],
  },
];


  for (const region of regions) {
    const createdRegion = await prisma.region.upsert({
      where: { name: region.name },
      update: {},
      create: { name: region.name },
    });

    for (const itemName of region.items) {
      await prisma.region_item.upsert({
        where: {
          name_region_id: {
            name: itemName,
            region_id: createdRegion.id,
          },
        },
        update: {},
        create: {
          name: itemName,
          region_id: createdRegion.id,
        },
      });
    }
  }

  console.log('Viloyat va tumanlar yaratildi.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
