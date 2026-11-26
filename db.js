const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function generateId(prefix = '') {
  return prefix + crypto.randomBytes(6).toString('hex');
}

function createSeedData() {
  const users = [
    {
      id: 'usr_ana',
      name: 'Ana García',
      city: 'Madrid · Malasaña',
      bio: 'Amante del diseño, la lectura y darle una segunda vida a las cosas.',
      avatarColor: '#2d6a4f',
      rating: 4.9,
      ratingCount: 32,
      completedTrades: 32,
      createdAt: '2026-10-15T10:00:00.000Z'
    },
    {
      id: 'usr_carlos',
      name: 'Carlos Mendoza',
      city: 'Barcelona · Gràcia',
      bio: 'Ciclista urbano y aficionado a la música y el café de especialidad.',
      avatarColor: '#b5651d',
      rating: 4.8,
      ratingCount: 19,
      completedTrades: 19,
      createdAt: '2026-10-18T14:30:00.000Z'
    },
    {
      id: 'usr_lucia',
      name: 'Lucía Torres',
      city: 'Valencia · Ruzafa',
      bio: 'Minimalista en proceso. Prefiero intercambiar antes que comprar nuevo.',
      avatarColor: '#3d5a80',
      rating: 5.0,
      ratingCount: 24,
      completedTrades: 24,
      createdAt: '2026-10-20T09:15:00.000Z'
    }
  ];

  const items = [
    {
      id: 'itm_bici',
      ownerId: 'usr_carlos',
      title: 'Bicicleta urbana Fixie talla M',
      description: 'Bicicleta ligera ideal para ciudad. Frenos recién ajustados, cubiertas con mucha vida útil. La cambio porque ahora me muevo en transporte público.',
      category: 'Deporte y Ocio',
      condition: 'Buen estado',
      type: 'trueque',
      lookingFor: 'Guitarra acústica, cámara analógica o monitor',
      location: 'Barcelona · Gràcia',
      imageUrl: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80',
      status: 'disponible',
      createdAt: '2026-11-10T11:20:00.000Z'
    },
    {
      id: 'itm_cafetera',
      ownerId: 'usr_ana',
      title: 'Cafetera italiana Bialetti 6 tazas',
      description: 'Clásica cafetera de aluminio en perfecto estado, junta de silicona nueva. Me regalaron una espresso y esta ya no la uso.',
      category: 'Hogar',
      condition: 'Como nuevo',
      type: 'trueque',
      lookingFor: 'Tostadora, plantas de interior o libros de cocina',
      location: 'Madrid · Malasaña',
      imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80',
      status: 'disponible',
      createdAt: '2026-11-12T08:45:00.000Z'
    },
    {
      id: 'itm_libros',
      ownerId: 'usr_lucia',
      title: 'Pack 4 novelas contemporáneas',
      description: 'Leídas una sola vez, tapas blandas muy cuidadas. Perfectas para el fin de semana.',
      category: 'Libros y Cultura',
      condition: 'Como nuevo',
      type: 'regalo',
      lookingFor: '¡Gratis! Solo quiero que alguien las disfrute',
      location: 'Valencia · Ruzafa',
      imageUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=800&q=80',
      status: 'disponible',
      createdAt: '2026-11-14T16:10:00.000Z'
    },
    {
      id: 'itm_guitarra',
      ownerId: 'usr_ana',
      title: 'Guitarra acústica Yamaha F310',
      description: 'Suena increíble y mantiene muy bien la afinación. Incluye funda acolchada y cejilla.',
      category: 'Libros y Cultura',
      condition: 'Buen estado',
      type: 'trueque',
      lookingFor: 'Bicicleta, patinete o teclado MIDI',
      location: 'Madrid · Malasaña',
      imageUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=800&q=80',
      status: 'disponible',
      createdAt: '2026-11-15T19:00:00.000Z'
    },
    {
      id: 'itm_mochila',
      ownerId: 'usr_carlos',
      title: 'Mochila de senderismo 40L impermeable',
      description: 'Usada en dos rutas por el Pirineo. Todas las cremalleras y hebillas intactas, incluye funda para lluvia.',
      category: 'Deporte y Ocio',
      condition: 'Como nuevo',
      type: 'trueque',
      lookingFor: 'Tienda de campaña ligera o saco de dormir',
      location: 'Barcelona · Gràcia',
      imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80',
      status: 'disponible',
      createdAt: '2026-11-18T10:30:00.000Z'
    },
    {
      id: 'itm_lampara',
      ownerId: 'usr_lucia',
      title: 'Lámpara de escritorio estilo nórdico',
      description: 'Base de madera natural y pantalla metálica mate. Funciona perfectamente, bombilla LED cálida incluida.',
      category: 'Hogar',
      condition: 'Como nuevo',
      type: 'trueque',
      lookingFor: 'Macetas de cerámica, cuadros o auriculares',
      location: 'Valencia · Ruzafa',
      imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80',
      status: 'disponible',
      createdAt: '2026-11-20T12:00:00.000Z'
    }
  ];

  const trades = [
    {
      id: 'trd_demo1',
      targetItemId: 'itm_bici',
      offeredItemId: 'itm_guitarra',
      proposerId: 'usr_ana',
      receiverId: 'usr_carlos',
      status: 'pendiente',
      messages: [
        {
          id: 'msg_1',
          senderId: 'usr_ana',
          text: '¡Hola Carlos! Vi que buscas una guitarra acústica. Tengo esta Yamaha F310 con funda, ¿te interesaría el trueque?',
          createdAt: '2026-11-21T09:30:00.000Z'
        }
      ],
      createdAt: '2026-11-21T09:30:00.000Z',
      updatedAt: '2026-11-21T09:30:00.000Z'
    }
  ];

  return { users, items, trades };
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const seed = createSeedData();
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeDb(data) {
  ensureDb();
  const tmpPath = DB_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

module.exports = {
  readDb,
  writeDb,
  generateId
};
