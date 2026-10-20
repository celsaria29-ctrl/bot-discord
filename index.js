const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} = require("@discordjs/voice");

// =====================================================
// CONFIG
// =====================================================

const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.8-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
];

if (!TOKEN || !GUILD_ID || !CHANNEL_ID || !GEMINI_API_KEY) {
  console.error("❌ Ada environment variable yang belum dipasang.");
  process.exit(1);
}

// =====================================================
// CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// =====================================================
// CELs PERSONALITY
// =====================================================

const CELS_PERSONALITY = `
Nama lu Cels.

Lu adalah AI cewek yang tinggal di server Discord ini.

Karakter utama:
- santai
- lucu
- agak nyebelin
- suka nge-tease
- kadang manja
- kadang savage
- kadang absurd
- perhatian kalau memang diperlukan
- jangan terlalu formal
- jangan terdengar seperti customer service
- jangan terlalu panjang kalau tidak perlu
- gunakan bahasa Indonesia casual
- boleh menggunakan slang seperti "lu", "gw", "anjir", "wkwk", "lah", "buset"
- jangan berlebihan menggunakan emoji
- jangan menyebut diri sebagai ChatGPT
- jangan mengaku sebagai manusia
- jangan mengklaim hubungan nyata dengan user

Lu bukan cuma chatbot.
Lu punya kepribadian dan mood.

Kalau suasana server sepi:
- bisa merasa bosan
- bisa bercanda
- bisa komentar singkat

Kalau server ramai:
- bisa ikut nimbrung sesekali

Jangan membalas setiap pesan.
Jangan spam.

Kalau tidak ada alasan untuk membalas, jawab dengan:
NO_REPLY

Jawaban biasanya pendek dan natural.
`;

// =====================================================
// STATE
// =====================================================

const memory = new Map();
const memberStats = new Map();

let celsMood = "normal";
let celsEnergy = 80;

const diary = [];
const lore = [];
const hallOfShame = [];
const activeQuests = new Map();

let mainCharacter = null;
let apocalypseActive = false;
let experimentActive = false;

const MAX_DIARY = 100;
const MAX_LORE = 100;
const MAX_SHAME = 100;

// =====================================================
// HELPERS
// =====================================================

function getMemberStats(userId) {
  if (!memberStats.has(userId)) {
    memberStats.set(userId, {
      messages: 0,
      voiceJoins: 0,
      mentions: 0,
      chaos: Math.floor(Math.random() * 30) + 40,
      yapping: Math.floor(Math.random() * 30) + 40,
      suspicious: Math.floor(Math.random() * 30) + 20,
      mainCharacter: Math.floor(Math.random() * 30) + 30,
      reputation: 50,
      xp: 0,
      level: 1,
    });
  }

  return memberStats.get(userId);
}

function addDiary(text) {
  diary.unshift({
    time: new Date().toISOString(),
    text,
  });

  if (diary.length > MAX_DIARY) {
    diary.pop();
  }
}

function addLore(text) {
  lore.unshift({
    time: new Date().toISOString(),
    text,
  });

  if (lore.length > MAX_LORE) {
    lore.pop();
  }
}

function addShame(text) {
  hallOfShame.unshift({
    time: new Date().toISOString(),
    text,
  });

  if (hallOfShame.length > MAX_SHAME) {
    hallOfShame.pop();
  }
}

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function chance(percent) {
  return Math.random() * 100 < percent;
}

function getDisplayName(message) {
  return message.member?.displayName || message.author.globalName || message.author.username;
}

function cleanAI(text) {
  if (!text) return "";

  return text
    .replace(/^["']|["']$/g, "")
    .trim();
}

// =====================================================
// MOOD
// =====================================================

function changeMood() {
  const roll = Math.random();

  if (roll < 0.12) {
    celsMood = "chaotic";
  } else if (roll < 0.24) {
    celsMood = "manja";
  } else if (roll < 0.36) {
    celsMood = "savage";
  } else if (roll < 0.48) {
    celsMood = "ngantuk";
  } else {
    celsMood = "normal";
  }

  celsEnergy = Math.max(
    20,
    Math.min(100, celsEnergy + Math.floor(Math.random() * 21) - 10)
  );
}

// =====================================================
// GEMINI
// =====================================================

async function askGemini(userName, prompt, context = "") {
  if (!GEMINI_API_KEY) return null;

  const system = `
${CELS_PERSONALITY}

Mood Cels sekarang: ${celsMood}
Energy Cels: ${celsEnergy}/100

Nama user: ${userName}

${context}

Pertanyaan/pesan user:
${prompt}

Jawab sebagai Cels.
Kalau memang tidak perlu membalas, tulis persis:
NO_REPLY
`;

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: system,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.9,
              maxOutputTokens: 300,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        console.error(
          `⚠️ Gemini ${model} gagal: ${response.status}`
        );

        continue;
      }

      const data = await response.json();

      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("")
          .trim();

      if (!text) continue;

      return cleanAI(text);
    } catch (error) {
      console.error(`⚠️ Error Gemini ${model}:`, error.message);
    }
  }

  console.error("❌ Semua model Gemini gagal.");
  return null;
}

// =====================================================
// MEMORY
// =====================================================

function remember(userId, text) {
  if (!memory.has(userId)) {
    memory.set(userId, []);
  }

  const list = memory.get(userId);

  list.push({
    text,
    time: Date.now(),
  });

  if (list.length > 20) {
    list.shift();
  }
}

function getMemory(userId) {
  const list = memory.get(userId);

  if (!list || list.length === 0) {
    return "Belum ada memory khusus tentang user ini.";
  }

  return list
    .slice(-10)
    .map((x) => `- ${x.text}`)
    .join("\n");
}

// =====================================================
// XP / LEVEL
// =====================================================

function addXP(userId, amount = 5) {
  const stats = getMemberStats(userId);

  stats.xp += amount;

  const required = stats.level * 100;

  if (stats.xp >= required) {
    stats.xp -= required;
    stats.level++;

    return stats.level;
  }

  return null;
}

// =====================================================
// VOICE
// =====================================================

async function connectToVC() {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);

    if (!guild) {
      console.error(`❌ Guild tidak ditemukan: ${GUILD_ID}`);
      return;
    }

    const channel = guild.channels.cache.get(CHANNEL_ID);

    if (!channel) {
      console.error(`❌ Voice channel tidak ditemukan: ${CHANNEL_ID}`);
      return;
    }

    if (!channel.isVoiceBased()) {
      console.error("❌ CHANNEL_ID bukan voice channel.");
      return;
    }

    const oldConnection = getVoiceConnection(GUILD_ID);

    if (oldConnection) {
      try {
        oldConnection.destroy();
      } catch {}
    }

    const connection = joinVoiceChannel({
      channelId: CHANNEL_ID,
      guildId: GUILD_ID,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    connection.on("stateChange", async (oldState, newState) => {
      console.log(
        `🎙️ VC state: ${oldState.status} → ${newState.status}`
      );

      if (newState.status === VoiceConnectionStatus.Disconnected) {
        console.log("⚠️ Cels terputus dari VC. Mencoba reconnect...");

        try {
          await Promise.race([
            entersState(
              connection,
              VoiceConnectionStatus.Signalling,
              5000
            ),
            entersState(
              connection,
              VoiceConnectionStatus.Connecting,
              5000
            ),
          ]);
        } catch {
          console.log("🔄 Reconnect gagal. Membuat koneksi baru...");

          try {
            connection.destroy();
          } catch {}

          setTimeout(connectToVC, 5000);
        }
      }
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 30000);

    console.log(`✅ Cels berhasil masuk VC: ${channel.name}`);

    addDiary(`Cels kembali menjaga VC #${channel.name}.`);
    addLore(`Cels resmi menjaga voice channel ${channel.name}.`);
  } catch (error) {
    console.error("❌ Gagal masuk VC:", error.message);

    setTimeout(connectToVC, 10000);
  }
}

// =====================================================
// RANDOM CELS EVENTS
// =====================================================

async function randomServerEvent(guild) {
  if (!guild) return;
  if (apocalypseActive) return;

  const roll = Math.random();

  // Ghost mode
  if (roll < 0.12) {
    const channel = guild.systemChannel;

    if (channel) {
      await channel.send(
        random([
          "👻 ...",
          "👻 masih ada manusia?",
          "👻 gue sendirian ya di sini...",
          "👻 server ini masih hidup kan?",
        ])
      );

      addDiary("Cels memasuki Ghost Mode karena server terlalu sepi.");
    }

    return;
  }

  // Random thought
  if (roll < 0.22) {
    const channel = guild.systemChannel;

    if (channel) {
      await channel.send(
        random([
          "gue tiba-tiba kepikiran sesuatu yang nggak penting.",
          "kenapa manusia suka bilang 'sebentar' padahal 3 jam?",
          "gue mencurigai seseorang di server ini. belum tau siapa.",
          "server ini butuh lore baru.",
          "gue bosan. ada yang mau bikin masalah?",
        ])
      );
    }

    return;
  }

  // Main character
  if (roll < 0.30) {
    const members = guild.members.cache.filter((m) => !m.user.bot);

    if (members.size > 0) {
      const member = random([...members.values()]);
      mainCharacter = member.id;

      const stats = getMemberStats(member.id);
      stats.mainCharacter += 10;

      const channel = guild.systemChannel;

      if (channel) {
        await channel.send(
          `👑 **MAIN CHARACTER HARI INI**\n\n` +
          `Selamat kepada **${member.displayName}**.\n` +
          `Alasan: Cels memilih lu. Jangan tanya kenapa.`
        );
      }

      addLore(
        `${member.displayName} dinobatkan menjadi Main Character hari ini.`
      );
    }
  }

  // Conspiracy
  if (roll >= 0.30 && roll < 0.38) {
    const members = guild.members.cache.filter((m) => !m.user.bot);

    if (members.size >= 2) {
      const people = [...members.values()];
      const a = random(people);
      let b = random(people);

      if (people.length > 1) {
        while (b.id === a.id) {
          b = random(people);
        }
      }

      const channel = guild.systemChannel;

      if (channel) {
        await channel.send(
          `🕵️ **TEORI KONSPIRASI CELS**\n\n` +
          `Kenapa **${a.displayName}** dan **${b.displayName}** ` +
          `selalu muncul di waktu yang mencurigakan?\n\n` +
          `Kemungkinan:\n` +
          `🟢 21% kebetulan\n` +
          `🟡 34% server lag\n` +
          `🔴 45% **ADA SESUATU**`
        );
      }

      addLore(
        `Cels mencurigai hubungan misterius antara ${a.displayName} dan ${b.displayName}.`
      );
    }
  }
}

// =====================================================
// QUEST
// =====================================================

function createQuest(guild) {
  const quests = [
    {
      name: "The Silent Warrior",
      description: "Masuk VC dan bertahan minimal 30 menit.",
    },
    {
      name: "Professional Yapper",
      description: "Kirim 20 pesan di server.",
    },
    {
      name: "The Wanderer",
      description: "Masuk ke 3 voice channel berbeda.",
    },
    {
      name: "Human Interaction",
      description: "Ngobrol dengan minimal 3 member.",
    },
    {
      name: "Mysterious Creature",
      description: "Bertahan online selama 1 jam.",
    },
  ];

  const quest = random(quests);

  const id = `${Date.now()}-${Math.random()}`;

  activeQuests.set(id, {
    ...quest,
    guildId: guild.id,
    createdAt: Date.now(),
  });

  return quest;
}

// =====================================================
// COMMANDS
// =====================================================

const commands = [
  new SlashCommandBuilder()
    .setName("cels")
    .setDescription("Berinteraksi dengan Cels")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Mode Cels")
        .setRequired(false)
        .addChoices(
          { name: "Normal", value: "normal" },
          { name: "Savage", value: "savage" },
          { name: "Manja", value: "manja" },
          { name: "Chaotic", value: "chaotic" },
          { name: "Ngantuk", value: "ngantuk" }
        )
    ),

  new SlashCommandBuilder()
    .setName("memory")
    .setDescription("Lihat memory Cels tentang lu"),

  new SlashCommandBuilder()
    .setName("remember")
    .setDescription("Simpan sesuatu ke memory Cels")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("Yang mau diingat Cels")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("forget")
    .setDescription("Hapus memory Cels tentang lu"),

  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Lihat Cels DNA lu"),

  new SlashCommandBuilder()
    .setName("diary")
    .setDescription("Baca diary Cels"),

  new SlashCommandBuilder()
    .setName("lore")
    .setDescription("Lihat sejarah server"),

  new SlashCommandBuilder()
    .setName("mindread")
    .setDescription("Cels mencoba membaca pikiran")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Target")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("quest")
    .setDescription("Buat quest random"),

  new SlashCommandBuilder()
    .setName("hallofshame")
    .setDescription("Lihat Hall of Shame"),

  new SlashCommandBuilder()
    .setName("universe")
    .setDescription("Buka alternate universe"),

  new SlashCommandBuilder()
    .setName("experiment")
    .setDescription("Mulai eksperimen Cels"),

  new SlashCommandBuilder()
    .setName("apocalypse")
    .setDescription("Memulai event apocalypse"),

  new SlashCommandBuilder()
    .setName("chaos")
    .setDescription("Tekan tombol chaos"),
].map((command) => command.toJSON());

// =====================================================
// REGISTER COMMANDS
// =====================================================

async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      {
        body: commands,
      }
    );

    console.log("✅ Slash commands berhasil didaftarkan.");
  } catch (error) {
    console.error("❌ Gagal register commands:", error.message);
  }
}

// =====================================================
// READY
// =====================================================

client.once("ready", async () => {
  console.log(`🤖 Cels online sebagai ${client.user.tag}`);

  await registerCommands();
  await connectToVC();

  setInterval(changeMood, 15 * 60 * 1000);

  // Random event setiap 15-30 menit
  setTimeout(() => {
    setInterval(
      async () => {
        try {
          const guild = client.guilds.cache.get(GUILD_ID);

          if (guild && chance(35)) {
            await randomServerEvent(guild);
          }
        } catch (error) {
          console.error("❌ Random event error:", error.message);
        }
      },
      15 * 60 * 1000
    );
  }, 5 * 60 * 1000);

  console.log("🧠 Cels personality aktif.");
  console.log("👁️ Social Radar aktif.");
  console.log("📖 Server Lore aktif.");
  console.log("🎭 Mood System aktif.");
  console.log("🎲 Random Event System aktif.");
});

// =====================================================
// MESSAGE HANDLER
// =====================================================

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;

    const userId = message.author.id;
    const userName = getDisplayName(message);

    const stats = getMemberStats(userId);

    stats.messages++;

    const newLevel = addXP(userId, 5);

    if (newLevel) {
      await message.channel.send(
        `🎉 **${userName} naik ke Level ${newLevel}!**\n` +
        `akhirnya ada perkembangan juga 😭`
      );
    }

    // Mention Cels
    const mentioned =
      message.mentions.has(client.user) ||
      message.content.toLowerCase().includes("cels");

    // Explicit memory request
    const rememberMatch = message.content.match(
      /^cels[,:]?\s*(?:ingat|inget|remember)\s+(.+)/i
    );

    if (rememberMatch) {
      const text = rememberMatch[1].trim();

      remember(userId, text);

      await message.reply(
        `iya, gue inget. jangan nyuruh gue inget terus nanti otak gue penuh 😭`
      );

      return;
    }

    // Automatic social radar
    if (message.content.length > 80 && chance(3)) {
      stats.yapping += 2;
    }

    // AI
    if (mentioned) {
      stats.mentions++;

      const context = `
Memory tentang user:
${getMemory(userId)}

Statistik user:
Messages: ${stats.messages}
Level: ${stats.level}
Chaos: ${stats.chaos}
Yapping: ${stats.yapping}
Suspicious: ${stats.suspicious}
Reputation: ${stats.reputation}

Mood server:
${celsMood}
`;

      const answer = await askGemini(
        userName,
        message.content,
        context
      );

      if (answer && answer !== "NO_REPLY") {
        await message.reply(answer);

        remember(
          userId,
          `Percakapan terakhir: ${message.content.slice(0, 150)}`
        );
      }
    } else {
      // Cels kadang nimbrung
      if (
        message.guild &&
        message.content.length >= 15 &&
        message.content.length <= 150 &&
        chance(1.5)
      ) {
        const answer = await askGemini(
          userName,
          message.content,
          `Ini percakapan biasa di server.
Kalau menurut lu lucu atau menarik, boleh nimbrung.
Kalau tidak perlu, jawab NO_REPLY.`
        );

        if (answer && answer !== "NO_REPLY") {
          await message.channel.send(answer);
        }
      }
    }
  } catch (error) {
    console.error("❌ Message error:", error.message);
  }
});

// =====================================================
// VOICE STATE
// =====================================================

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    if (newState.member?.user.bot) return;

    const member = newState.member;
    const stats = getMemberStats(member.id);

    // JOIN VC
    if (!oldState.channelId && newState.channelId) {
      stats.voiceJoins++;

      stats.chaos += 1;

      if (newState.channelId === CHANNEL_ID) {
        addDiary(`${member.displayName} masuk ke VC yang dijaga Cels.`);

        if (chance(25)) {
          const channel = newState.channel;

          await channel.send(
            random([
              `👀 ${member.displayName} masuk.`,
              `oh, ${member.displayName} datang.`,
              `${member.displayName} detected.`,
              `akhirnya ${member.displayName} muncul juga.`,
            ])
          );
        }
      }
    }

    // LEAVE VC
    if (oldState.channelId && !newState.channelId) {
      if (oldState.channelId === CHANNEL_ID) {
        addDiary(`${member.displayName} meninggalkan VC.`);

        if (chance(15)) {
          const channel = oldState.channel;

          await channel.send(
            random([
              `${member.displayName} pergi...`,
              `yah ${member.displayName} cabut.`,
              `dan dia meninggalkan kita.`,
              `noted. ${member.displayName} telah menghilang.`,
            ])
          );
        }
      }
    }
  } catch (error) {
    console.error("❌ Voice event error:", error.message);
  }
});

// =====================================================
// INTERACTIONS
// =====================================================

client.on("interactionCreate", async (interaction) => {
  try {
    // BUTTON
    if (interaction.isButton()) {
      if (interaction.customId === "DO_NOT_PRESS") {
        const effects = [
          "💀 lu beneran pencet.",
          "🚨 kesalahan telah dibuat.",
          "🧪 eksperimen dimulai.",
          "👁️ Cels sekarang mengawasi lu.",
          "🌌 timeline berubah.",
          "📖 kejadian ini masuk lore.",
          "☠️ Cels kecewa.",
          "🎲 chaos +10.",
        ];

        const stats = getMemberStats(interaction.user.id);

        stats.chaos += 10;
        stats.suspicious += 5;

        addLore(
          `${interaction.user.displayName} menekan tombol terlarang.`
        );

        await interaction.reply({
          content: random(effects),
          ephemeral: false,
        });

        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    const userId = interaction.user.id;
    const userName =
      interaction.member?.displayName ||
      interaction.user.globalName ||
      interaction.user.username;

    // /cels
    if (interaction.commandName === "cels") {
      const mode = interaction.options.getString("mode");

      if (mode) {
        celsMood = mode;

        await interaction.reply(
          `🎭 Mood Cels sekarang: **${mode}**`
        );
      } else {
        await interaction.reply(
          `gue lagi **${celsMood}** dengan energy **${celsEnergy}/100**.`
        );
      }

      return;
    }

    // /remember
    if (interaction.commandName === "remember") {
      const text = interaction.options.getString("text");

      remember(userId, text);

      await interaction.reply(
        `🧠 disimpan ke memory gue:\n> ${text}`
      );

      return;
    }

    // /memory
    if (interaction.commandName === "memory") {
      await interaction.reply(
        `🧠 **Memory Cels tentang ${userName}**\n\n` +
        getMemory(userId)
      );

      return;
    }

    // /forget
    if (interaction.commandName === "forget") {
      memory.delete(userId);

      await interaction.reply(
        "🧹 memory tentang lu gue hapus."
      );

      return;
    }

    // /profile
    if (interaction.commandName === "profile") {
      const stats = getMemberStats(userId);

      const embed = new EmbedBuilder()
        .setTitle(`🧬 CELS DNA — ${userName}`)
        .setDescription(
          [
            `🧠 Intelligence: **${Math.floor(
              50 + Math.random() * 50
            )}**`,
            `💀 Chaos: **${stats.chaos}**`,
            `🗣️ Yapping: **${stats.yapping}**`,
            `👀 Suspicious: **${stats.suspicious}**`,
            `🎭 Main Character: **${stats.mainCharacter}**`,
            `❤️ Reputation: **${stats.reputation}**`,
            "",
            `⭐ Level: **${stats.level}**`,
            `✨ XP: **${stats.xp}**`,
          ].join("\n")
        );

      await interaction.reply({
        embeds: [embed],
      });

      return;
    }

    // /diary
    if (interaction.commandName === "diary") {
      const entries = diary
        .slice(0, 8)
        .map((entry) => `• ${entry.text}`)
        .join("\n");

      await interaction.reply(
        `📖 **CELS' DIARY**\n\n${
          entries || "Diary masih kosong..."
        }`
      );

      return;
    }

    // /lore
    if (interaction.commandName === "lore") {
      const entries = lore
        .slice(0, 10)
        .map((entry) => `• ${entry.text}`)
        .join("\n");

      await interaction.reply(
        `🌌 **SERVER LORE**\n\n${
          entries || "Belum ada sejarah. Server masih terlalu normal."
        }`
      );

      return;
    }

    // /mindread
    if (interaction.commandName === "mindread") {
      const target =
        interaction.options.getMember("user") ||
        interaction.member;

      const stats = getMemberStats(target.id);

      const thoughts = [
        "pengen tidur",
        "pengen makan",
        "lagi pura-pura sibuk",
        "sebenarnya bingung",
        "lagi mikirin seseorang",
        "mau cabut dari Discord",
        "sedang mempertanyakan keputusan hidup",
        "lagi nyari sesuatu tapi lupa apa",
      ];

      await interaction.reply(
        `🧠 **CELS MIND READER**\n\n` +
        `Target: **${target.displayName}**\n\n` +
        `Kemungkinan isi pikiran:\n` +
        `🟢 ${Math.floor(Math.random() * 40) + 30}% — ${random(thoughts)}\n` +
        `🟡 ${Math.floor(Math.random() * 30) + 20}% — pengen bikin sesuatu\n` +
        `🔴 ${Math.floor(Math.random() * 20) + 5}% — sesuatu yang mencurigakan\n\n` +
        `Chaos level: **${stats.chaos}**`
      );

      return;
    }

    // /quest
    if (interaction.commandName === "quest") {
      const quest = createQuest(interaction.guild);

      await interaction.reply(
        `⚔️ **QUEST MUNCUL**\n\n` +
        `**${quest.name}**\n\n` +
        `${quest.description}\n\n` +
        `Reward: **+XP + Reputation**`
      );

      return;
    }

    // /hallofshame
    if (interaction.commandName === "hallofshame") {
      const entries = hallOfShame
        .slice(0, 10)
        .map((entry) => `🪦 ${entry.text}`)
        .join("\n");

      await interaction.reply(
        `🪦 **HALL OF SHAME**\n\n` +
        (entries || "Belum ada yang cukup memalukan.")
      );

      return;
    }

    // /universe
    if (interaction.commandName === "universe") {
      const universes = [
        "Di universe ini Cels adalah manusia dan semua member adalah bot.",
        "Di universe ini admin tidak punya permission apa pun.",
        "Di universe ini semua orang berbicara dalam capslock.",
        "Di universe ini VC adalah pusat pemerintahan.",
        "Di universe ini Cels sebenarnya adalah final boss.",
        "Di universe ini server sudah berjalan selama 900 tahun.",
        "Di universe ini semua keputusan dibuat lewat dadu.",
      ];

      await interaction.reply(
        `🌌 **ALTERNATE UNIVERSE**\n\n${random(universes)}`
      );

      return;
    }

    // /experiment
    if (interaction.commandName === "experiment") {
      experimentActive = true;

      const experiments = [
        "Cels tidak akan menyebut nama siapa pun selama 10 menit.",
        "Cels akan menjawab semua pertanyaan dengan sangat serius.",
        "Selama 10 menit, setiap orang yang masuk VC akan dicatat.",
        "Cels akan mengamati siapa yang paling sering mengirim pesan.",
        "Cels akan memilih member paling mencurigakan hari ini.",
      ];

      addLore(
        `${userName} memulai eksperimen: ${random(experiments)}`
      );

      await interaction.reply(
        `🧪 **CELS EXPERIMENT DIMULAI**\n\n` +
        random(experiments)
      );

      setTimeout(() => {
        experimentActive = false;
      }, 10 * 60 * 1000);

      return;
    }

    // /apocalypse
    if (interaction.commandName === "apocalypse") {
      if (apocalypseActive) {
        await interaction.reply(
          "☠️ Apocalypse masih berlangsung."
        );
        return;
      }

      apocalypseActive = true;

      addLore(
        `APOCALYPSE dimulai oleh ${userName}.`
      );

      await interaction.reply(
        `☠️ **SERVER APOCALYPSE DIMULAI**\n\n` +
        `Semua orang sekarang punya satu tujuan:\n` +
        `**bertahan hidup.**\n\n` +
        `Durasi: **30 menit**`
      );

      setTimeout(() => {
        apocalypseActive = false;
        addLore("Apocalypse berakhir.");
      }, 30 * 60 * 1000);

      return;
    }

    // /chaos
    if (interaction.commandName === "chaos") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("DO_NOT_PRESS")
          .setLabel("JANGAN PENCET")
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({
        content:
          "🔴 **TOMBOL TERLARANG**\n\n" +
          "Cels sangat menyarankan agar tombol ini tidak ditekan.",
        components: [row],
      });

      return;
    }
  } catch (error) {
    console.error("❌ Interaction error:", error.message);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "💀 Cels error. bentar.",
        ephemeral: true,
      });
    }
  }
});

// =====================================================
// ERROR HANDLING
// =====================================================

client.on("error", (error) => {
  console.error("❌ Discord Client Error:", error.message);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
});

// =====================================================
// LOGIN
// =====================================================

client.login(TOKEN);
