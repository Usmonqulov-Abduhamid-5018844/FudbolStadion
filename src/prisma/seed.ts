import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
const regions = [
  {
    name: 'Toshkent shahri',
    items: [
      'Chilonzor tumani',
      'Yunusobod tumani',
      'Olmazor tumani',
      'Yakkasaroy tumani',
      'Sergeli tumani',
      'Mirzo Ulugʻbek tumani',
      'Shayxontohur tumani',
      'Yashnobod tumani',
      'Uchtepa tumani',
    ],
  },
  {
    name: 'Andijon viloyati',
    items: [
      'Andijon shahri',
      'Asaka tumani',
      'Baliqchi tumani',
      'Boʻston tumani',
      'Izboskan tumani',
      'Qoʻrgʻontepa tumani',
      'Xonobod shahri',
      'Paxtaobod tumani',
      'Shahrixon tumani',
      'Ulugʻnor tumani',
      'Xoʻjaobod tumani',
    ],
  },
  {
    name: 'Fargʻona viloyati',
    items: [
      'Fargʻona shahri',
      'Qoʻqon shahri',
      'Margʻilon shahri',
      'Beshariq tumani',
      'Bagʻdod tumani',
      'Buvayda tumani',
      'Dangʻara tumani',
      'Furqat tumani',
      'Oltiariq tumani',
      'Oʻzbekiston tumani',
      'Rishton tumani',
      'Soʻx tumani',
      'Toshloq tumani',
      'Uchkoʻprik tumani',
      'Quva tumani',
      'Yozyovon tumani',
    ],
  },
  {
    name: 'Namangan viloyati',
    items: [
      'Namangan shahri',
      'Namangan tumani',
      'Chortoq tumani',
      'Chust tumani',
      'Kosonsoy tumani',
      'Mingbuloq tumani',
      'Norin tumani',
      'Pop tumani',
      'Toshbuloq tumani',
      'Uchqoʻrgʻon tumani',
      'Uychi tumani',
      'Yangiqoʻrgʻon tumani',
    ],
  },
  {
    name: 'Samarqand viloyati',
    items: [
      'Samarqand shahri',
      'Samarqand tumani',
      'Bulungʻur tumani',
      'Jomboy tumani',
      'Ishtixon tumani',
      'Kattaqoʻrgʻon tumani',
      'Narpay tumani',
      'Oqdaryo tumani',
      'Payariq tumani',
      'Pastdargʻom tumani',
      'Qoʻshrabot tumani',
      'Toyloq tumani',
      'Urgut tumani',
      'Paxtachi tumani',
    ],
  },
  {
    name: 'Buxoro viloyati',
    items: [
      'Buxoro shahri',
      'Buxoro tumani',
      'Gʻijduvon tumani',
      'Jondor tumani',
      'Kogon shahri',
      'Peshku tumani',
      'Romitan tumani',
      'Shofirkon tumani',
      'Vobkent tumani',
    ],
  },
  {
    name: 'Xorazm viloyati',
    items: [
      'Urganch shahri',
      'Urganch tumani',
      'Xiva shahri',
      'Bogʻot tumani',
      'Gurlan tumani',
      'Shovot tumani',
      'Xonqa tumani',
      'Hazorasp tumani',
      'Yangiariq tumani',
    ],
  },
  {
    name: 'Qashqadaryo viloyati',
    items: [
      'Qarshi shahri',
      'Qarshi tumani',
      'Chiroqchi tumani',
      'Gʻuzor tumani',
      'Dehqonobod tumani',
      'Koson tumani',
      'Kitob tumani',
      'Mirishkor tumani',
      'Shahrisabz shahri',
      'Yakkabogʻ tumani',
      'Muborak tumani',
    ],
  },
  {
    name: 'Surxondaryo viloyati',
    items: [
      'Termiz shahri',
      'Termiz tumani',
      'Angor tumani',
      'Boysun tumani',
      'Denov tumani',
      'Jarqoʻrgʻon tumani',
      'Muzrabot tumani',
      'Sariosiyo tumani',
      'Sherobod tumani',
      'Shoʻrchi tumani',
      'Uzun tumani',
    ],
  },
  {
    name: 'Sirdaryo viloyati',
    items: [
      'Guliston shahri',
      'Boyovut tumani',
      'Yangiyer shahri',
      'Oqoltin tumani',
      'Sardoba tumani',
      'Sayxunobod tumani',
      'Shirin shahri',
      'Sirdaryo tumani',
      'Xovos tumani',
    ],
  },
  {
    name: 'Jizzax viloyati',
    items: [
      'Jizzax shahri',
      'Arnasoy tumani',
      'Baxmal tumani',
      'Doʻstlik tumani',
      'Forish tumani',
      'Gʻallaorol tumani',
      'Mirzachoʻl tumani',
      'Paxtakor tumani',
      'Sharof Rashidov tumani',
      'Yangiobod tumani',
      'Zarbdor tumani',
    ],
  },
  {
    name: 'Navoiy viloyati',
    items: [
      'Navoiy shahri',
      'Karmana tumani',
      'Konimex tumani',
      'Navbahor tumani',
      'Nurota tumani',
      'Tomdi tumani',
      'Uchquduq tumani',
      'Xatirchi tumani',
      'Qiziltepa tumani',
    ],
  },
  {
    name: 'Toshkent viloyati',
    items: [
      'Angren shahri',
      'Bekobod shahri',
      'Boʻka tumani',
      'Chirchiq shahri',
      'Ohangaron shahri',
      'Olmaliq shahri',
      'Parkent tumani',
      'Piskent tumani',
      'Quyi Chirchiq tumani',
      'Oʻrta Chirchiq tumani',
      'Zangiota tumani',
      'Yangiyoʻl tumani',
      'Yuqori Chirchiq tumani',
    ],
  },
  {
    name: 'Qoraqalpogʻiston Respublikasi',
    items: [
      'Nukus shahri',
      'Nukus tumani',
      'Amudaryo tumani',
      'Beruniy tumani',
      'Chimboy tumani',
      'Ellikqalʼa tumani',
      'Kegeyli tumani',
      'Moʻynoq tumani',
      'Qanlikoʻl tumani',
      'Qoʻngʻirot tumani',
      'Shumanay tumani',
      'Taxiatosh shahri',
      'Toʻrtkoʻl tumani',
      'Xoʻjayli shahri',
      'Xoʻjayli tumani',
      'Taxtakoʻpir tumani',
    ],
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
