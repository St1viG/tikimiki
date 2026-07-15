/**
 * Development seed — populates a fresh database with demo data so the app shows
 * real content right after `pnpm db:migrate`. Idempotent: bails if already run.
 *
 *   pnpm --filter ./backend db:seed
 *
 * Demo login for every account: password `password123`.
 */
import { hash } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env";
import * as schema from "./schema";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);
const ago = (mins: number) => new Date(Date.now() - mins * 60_000);

/** friendships enforce user_id_a < user_id_b (canonical order). */
function ordered(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function main() {
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });

  const seeded = await db
    .select({ id: schema.users.userId })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@tikimiki.dev"))
    .limit(1);
  if (seeded.length > 0) {
    console.log("↩  Already seeded — nothing to do.");
    await client.end();
    return;
  }

  const password = await hash("password123");

  // ── Admin ──────────────────────────────────────────────────────────
  const [admin] = await db
    .insert(schema.users)
    .values({
      username: "admin",
      displayName: "Admin Đurić",
      email: "admin@tikimiki.dev",
      passwordHash: password,
      isEmailVerified: true,
    })
    .returning();
  await db.insert(schema.administrators).values({ userId: admin.userId });

  // ── Members ────────────────────────────────────────────────────────
  const memberSeed = [
    {
      username: "andrej",
      displayName: "Andrej Čolić",
      email: "andrej@tikimiki.dev",
      points: 1240,
      bio: "Full-stack, voli hakatone.",
    },
    {
      username: "mohammed",
      displayName: "Mohammed Avdol",
      email: "mohammed@tikimiki.dev",
      points: 880,
      bio: "Frontend & dizajn.",
    },
    {
      username: "nenad",
      displayName: "Nenad Skoković",
      email: "nenad@tikimiki.dev",
      points: 410,
      bio: "Backend, Postgres.",
    },
    {
      username: "fenjer",
      displayName: "Fenjer Marić",
      email: "fenjer@tikimiki.dev",
      points: 2050,
      bio: "ML inženjer.",
    },
    {
      username: "mara",
      displayName: "Mara Jovanović",
      email: "mara@tikimiki.dev",
      points: 670,
      bio: "Dizajn i UX.",
    },
  ];
  const memberIds: string[] = [];
  for (const m of memberSeed) {
    const [u] = await db
      .insert(schema.users)
      .values({
        username: m.username,
        displayName: m.displayName,
        email: m.email,
        passwordHash: password,
        isEmailVerified: true,
        bio: m.bio,
      })
      .returning();
    await db.insert(schema.members).values({ userId: u.userId, points: m.points });
    await db.insert(schema.pointTransactions).values({
      userId: u.userId,
      type: "admin_adjustment",
      delta: m.points,
      balanceAfter: m.points,
      note: "seed",
    });
    memberIds.push(u.userId);
  }
  const [andrej, mohammed, nenad, fenjer, mara] = memberIds;

  // ── Organization (approved) ────────────────────────────────────────
  const [orgUser] = await db
    .insert(schema.users)
    .values({
      username: "etf_hackweek",
      displayName: "ETF HackWeek",
      email: "org@tikimiki.dev",
      passwordHash: password,
      isEmailVerified: true,
    })
    .returning();
  await db.insert(schema.organizations).values({
    userId: orgUser.userId,
    name: "ETF HackWeek",
    websiteUrl: "https://etf.bg.ac.rs",
    contactEmail: "hack@etf.bg.ac.rs",
    verificationStatus: "approved",
    reviewedBy: admin.userId,
    reviewedAt: new Date(),
  });

  // A second org, still pending verification (for the admin panel queue).
  const [orgPending] = await db
    .insert(schema.users)
    .values({
      username: "garaza",
      displayName: "Garaža",
      email: "garaza@tikimiki.dev",
      passwordHash: password,
      isEmailVerified: true,
    })
    .returning();
  await db.insert(schema.organizations).values({
    userId: orgPending.userId,
    name: "Garaža",
    websiteUrl: "https://garaza.rs",
    contactEmail: "hello@garaza.rs",
    verificationStatus: "pending",
  });

  // ── Skills ─────────────────────────────────────────────────────────
  const skillRows = await db
    .insert(schema.skills)
    .values([
      { name: "React", category: "frontend" },
      { name: "TypeScript", category: "language" },
      { name: "Node.js", category: "backend" },
      { name: "PostgreSQL", category: "database" },
      { name: "UI/UX", category: "design" },
      { name: "Python", category: "language" },
      { name: "Machine Learning", category: "ai" },
    ])
    .returning();
  const skillId = (name: string) => skillRows.find((s) => s.name === name)!.skillId;

  // member_skills
  await db.insert(schema.memberSkills).values([
    { userId: andrej, skillId: skillId("React") },
    { userId: andrej, skillId: skillId("TypeScript") },
    { userId: andrej, skillId: skillId("Node.js") },
    { userId: mohammed, skillId: skillId("React") },
    { userId: mohammed, skillId: skillId("UI/UX") },
    { userId: nenad, skillId: skillId("Node.js") },
    { userId: nenad, skillId: skillId("PostgreSQL") },
    { userId: fenjer, skillId: skillId("Python") },
    { userId: fenjer, skillId: skillId("Machine Learning") },
    { userId: mara, skillId: skillId("UI/UX") },
  ]);

  // ── Hackathons ─────────────────────────────────────────────────────
  const hackRows = await db
    .insert(schema.hackathons)
    .values([
      {
        organizationId: orgUser.userId,
        title: "ETF HackWeek 2026",
        description: "48h hakaton na Elektrotehničkom fakultetu — AI & Web.",
        type: "physical",
        status: "ongoing",
        theme: "AI & Web",
        startsAt: inDays(-1),
        endsAt: inDays(1),
        registrationDeadline: inDays(-3),
        maxParticipants: 200,
        minTeamSize: 1,
        maxTeamSize: 4,
        location: "Beograd, ETF",
        coordinates: sql`ST_SetSRID(ST_MakePoint(20.4489, 44.8053), 4326)`,
      },
      {
        organizationId: orgUser.userId,
        title: "Garaža Hackathon 2026",
        description: "Startup vikend u Novom Sadu.",
        type: "physical",
        status: "upcoming",
        theme: "Startup",
        startsAt: inDays(35),
        endsAt: inDays(37),
        registrationDeadline: inDays(30),
        maxParticipants: 120,
        minTeamSize: 2,
        maxTeamSize: 5,
        location: "Novi Sad",
        coordinates: sql`ST_SetSRID(ST_MakePoint(19.8335, 45.2671), 4326)`,
      },
    ])
    .returning();
  const etf = hackRows[0].hackathonId;

  // ── Teams (in the live ETF hackathon) ──────────────────────────────
  const [teamDigitalci] = await db
    .insert(schema.teams)
    .values({ hackathonId: etf, name: "digitalci" })
    .returning();
  const [teamNullptr] = await db
    .insert(schema.teams)
    .values({ hackathonId: etf, name: "nullptr" })
    .returning();

  await db.insert(schema.teamMembers).values([
    { teamId: teamDigitalci.teamId, userId: andrej, role: "leader" },
    { teamId: teamDigitalci.teamId, userId: mohammed, role: "member" },
    { teamId: teamNullptr.teamId, userId: nenad, role: "leader" },
  ]);
  // fenjer & mara stay solo (free agents) for the /teams discovery view.

  // ── Submitted projects (for the audience-voting channel) ───────────
  // NB: the projects check constraint requires submittedAt to be set
  // whenever status is not "draft".
  const [projDigitalci] = await db
    .insert(schema.projects)
    .values({
      teamId: teamDigitalci.teamId,
      title: "Pulse — real-time campus events",
      description:
        "A live map of what's happening on campus right now, powered by student check-ins.",
      status: "submitted",
      repositoryUrl: "https://github.com/digitalci/pulse",
      submittedAt: ago(120),
    })
    .returning();
  const [projNullptr] = await db
    .insert(schema.projects)
    .values({
      teamId: teamNullptr.teamId,
      title: "Segfault — AI study buddy",
      description: "Explains your compiler errors in plain language and quizzes you on the fix.",
      status: "submitted",
      repositoryUrl: "https://github.com/nullptr/segfault",
      submittedAt: ago(95),
    })
    .returning();

  // A few audience votes (unique per voter per hackathon → free agents + one member).
  await db.insert(schema.votes).values([
    { hackathonId: etf, projectId: projDigitalci.projectId, voterId: mara },
    { hackathonId: etf, projectId: projDigitalci.projectId, voterId: mohammed },
    { hackathonId: etf, projectId: projNullptr.projectId, voterId: fenjer },
  ]);

  // ── Kanban board for team digitalci (board + columns + cards) ──────
  const [boardDig] = await db
    .insert(schema.kanbanBoards)
    .values({ teamId: teamDigitalci.teamId })
    .returning();
  const kanbanCols = await db
    .insert(schema.kanbanColumns)
    .values([
      { boardId: boardDig.boardId, name: "Za uraditi", position: 0 },
      { boardId: boardDig.boardId, name: "U toku", position: 1 },
      { boardId: boardDig.boardId, name: "Završeno", position: 2 },
    ])
    .returning();
  const colId = (name: string): string => kanbanCols.find((c) => c.name === name)!.columnId;
  await db.insert(schema.kanbanCards).values([
    {
      columnId: colId("Za uraditi"),
      createdBy: andrej,
      title: "Design the event-map UI",
      position: 0,
    },
    {
      columnId: colId("Za uraditi"),
      createdBy: andrej,
      assignedTo: mohammed,
      title: "Set up push notifications",
      position: 1,
    },
    {
      columnId: colId("U toku"),
      createdBy: mohammed,
      assignedTo: mohammed,
      title: "Check-in API endpoint",
      position: 0,
    },
    {
      columnId: colId("Završeno"),
      createdBy: andrej,
      assignedTo: andrej,
      title: "Repo + CI scaffolding",
      position: 0,
    },
  ]);

  // ── Applications to ETF ────────────────────────────────────────────
  const appRows = await db
    .insert(schema.applications)
    .values([
      {
        userId: andrej,
        hackathonId: etf,
        teamId: teamDigitalci.teamId,
        status: "approved",
        reviewedBy: orgUser.userId,
        reviewedAt: ago(2880),
      },
      {
        userId: mohammed,
        hackathonId: etf,
        teamId: teamDigitalci.teamId,
        status: "approved",
        reviewedBy: orgUser.userId,
        reviewedAt: ago(2880),
      },
      {
        userId: nenad,
        hackathonId: etf,
        teamId: teamNullptr.teamId,
        status: "approved",
        reviewedBy: orgUser.userId,
        reviewedAt: ago(2880),
      },
      { userId: fenjer, hackathonId: etf, status: "pending" },
      { userId: mara, hackathonId: etf, status: "waitlisted" },
    ])
    .returning({
      applicationId: schema.applications.applicationId,
      userId: schema.applications.userId,
    });
  const appByUser: Record<string, string> = {};
  for (const a of appRows) appByUser[a.userId] = a.applicationId;

  // ── Application-form questions + answers ───────────────────────────
  const [qWhy, qRole] = await db
    .insert(schema.applicationQuestions)
    .values([
      {
        hackathonId: etf,
        prompt: "Zašto želiš da učestvuješ na ovom hakatonu?",
        type: "long_text",
        required: true,
        position: 0,
      },
      {
        hackathonId: etf,
        prompt: "Koja je tvoja glavna uloga u timu?",
        type: "single_choice",
        options: ["Frontend", "Backend", "ML", "Dizajn"],
        required: true,
        position: 1,
      },
    ])
    .returning({ questionId: schema.applicationQuestions.questionId });

  await db.insert(schema.questionAnswers).values([
    {
      applicationId: appByUser[andrej],
      questionId: qWhy.questionId,
      answer: "Želim da izgradim nešto korisno i upoznam ekipu.",
    },
    { applicationId: appByUser[andrej], questionId: qRole.questionId, answer: "Backend" },
    {
      applicationId: appByUser[mohammed],
      questionId: qWhy.questionId,
      answer: "Da unapredim dizajn i frontend veštine.",
    },
    { applicationId: appByUser[mohammed], questionId: qRole.questionId, answer: "Frontend" },
    {
      applicationId: appByUser[nenad],
      questionId: qWhy.questionId,
      answer: "Da testiram backend znanje pod pritiskom rokova.",
    },
    { applicationId: appByUser[nenad], questionId: qRole.questionId, answer: "Backend" },
    {
      applicationId: appByUser[fenjer],
      questionId: qWhy.questionId,
      answer: "ML demo koji rešava realan problem.",
    },
    { applicationId: appByUser[fenjer], questionId: qRole.questionId, answer: "ML" },
    {
      applicationId: appByUser[mara],
      questionId: qWhy.questionId,
      answer: "Želim da radim na dizajnu proizvoda sa pravim timom.",
    },
    { applicationId: appByUser[mara], questionId: qRole.questionId, answer: "Dizajn" },
  ]);

  // ── Discord-style server for the ETF hackathon ─────────────────────
  const [server] = await db
    .insert(schema.servers)
    .values({ hackathonId: etf, name: "ETF HackWeek 2026" })
    .returning();

  const [groupGeneral] = await db
    .insert(schema.channelGroups)
    .values({ serverId: server.serverId, name: "OPŠTE", position: 0 })
    .returning();
  const [groupTeams] = await db
    .insert(schema.channelGroups)
    .values({ serverId: server.serverId, name: "TIMOVI", position: 1 })
    .returning();

  const [chOpste] = await db
    .insert(schema.channels)
    .values({ groupId: groupGeneral.groupId, type: "general", name: "opšte", position: 0 })
    .returning();
  await db
    .insert(schema.channels)
    .values({ groupId: groupGeneral.groupId, type: "announcements", name: "najave", position: 1 });
  await db.insert(schema.channels).values({
    groupId: groupTeams.groupId,
    type: "team",
    name: "tim-digitalci",
    teamId: teamDigitalci.teamId,
    position: 0,
  });

  // Grant server access to the approved applicants — mirrors what
  // ApplicationsService.approve() does at runtime (grantServerMembership),
  // so seeded "approved" applications actually see the server in Cohor.
  const [participantRole] = await db
    .insert(schema.serverRoles)
    .values({ serverId: server.serverId, name: "Participant" })
    .returning();
  await db.insert(schema.userRoles).values([
    { serverRoleId: participantRole.serverRoleId, userId: andrej, assignedBy: orgUser.userId },
    { serverRoleId: participantRole.serverRoleId, userId: mohammed, assignedBy: orgUser.userId },
    { serverRoleId: participantRole.serverRoleId, userId: nenad, assignedBy: orgUser.userId },
  ]);

  // Channel messages in #opšte
  const channelMsgSeed = [
    { senderId: andrej, content: "Dobrodošli na ETF HackWeek! 🎉", mins: 180 },
    { senderId: mohammed, content: "Jedva čekam, ekipa 🔥", mins: 120 },
    { senderId: nenad, content: "Gde je kafa? ☕", mins: 60 },
    { senderId: fenjer, content: "Postavljam ML demo za sat vremena.", mins: 20 },
  ];
  for (const m of channelMsgSeed) {
    const [msg] = await db
      .insert(schema.messages)
      .values({ senderId: m.senderId, content: m.content, sentAt: ago(m.mins) })
      .returning();
    await db
      .insert(schema.channelMessages)
      .values({ messageId: msg.messageId, channelId: chOpste.channelId });
  }

  // ── Direct-message conversation (andrej ↔ mohammed) ────────────────
  const [conv] = await db.insert(schema.conversations).values({ createdBy: andrej }).returning();
  await db.insert(schema.conversationMembers).values([
    { conversationId: conv.conversationId, userId: andrej },
    { conversationId: conv.conversationId, userId: mohammed },
  ]);
  const dmSeed = [
    { senderId: andrej, content: "Jesi za pair programming večeras?", mins: 90 },
    { senderId: mohammed, content: "Može, posle 8 👍", mins: 85 },
  ];
  for (const m of dmSeed) {
    const [msg] = await db
      .insert(schema.messages)
      .values({ senderId: m.senderId, content: m.content, sentAt: ago(m.mins) })
      .returning();
    await db
      .insert(schema.directMessages)
      .values({ messageId: msg.messageId, conversationId: conv.conversationId });
  }

  // ── Daily games ────────────────────────────────────────────────────
  await db.insert(schema.games).values([
    {
      slug: "spin",
      name: "Dnevni Spin",
      description: "Zavrti i osvoji poene.",
      maxPointsPerPlay: 100,
    },
    { slug: "quiz", name: "Kviz", description: "5 pitanja dnevno.", maxPointsPerPlay: 50 },
    {
      slug: "kodword",
      name: "Kodword",
      description: "Pogodi reč iz 6 pokušaja.",
      maxPointsPerPlay: 60,
    },
    { slug: "grupe", name: "Grupe", description: "Grupiši pojmove.", maxPointsPerPlay: 40 },
    { slug: "tempo", name: "Tempo", description: "Trka sa vremenom.", maxPointsPerPlay: 70 },
  ]);

  // ── Badges + an award ──────────────────────────────────────────────
  const badgeRows = await db
    .insert(schema.badges)
    .values([
      {
        name: "Prvi hakaton",
        description: "Učestvovao na prvom hakatonu.",
        category: "participation",
        iconUrl: "/badges/first.svg",
      },
      {
        name: "Timski igrač",
        description: "Formirao tim.",
        category: "social",
        iconUrl: "/badges/team.svg",
      },
      {
        name: "Pobednik",
        description: "Osvojio nagradu.",
        category: "achievement",
        iconUrl: "/badges/winner.svg",
      },
      {
        // Awarded automatically by GamesService.recordPlay (matched by name).
        // Language-neutral name; the description is the English fallback (the
        // frontend translates known badges via its own i18n map).
        name: "Flawless4",
        description: "Complete the Groups daily game without a single mistake.",
        category: "achievement",
        iconUrl: "/badges/flawless4.svg",
      },
    ])
    .returning();
  await db.insert(schema.userBadges).values([
    { userId: andrej, badgeId: badgeRows[0].badgeId },
    { userId: andrej, badgeId: badgeRows[1].badgeId },
    { userId: fenjer, badgeId: badgeRows[2].badgeId },
  ]);

  // ── Cosmetics + merch (store) ──────────────────────────────────────
  await db.insert(schema.cosmeticItems).values([
    {
      type: "username_effect",
      name: "Neon Ime",
      description: "Svetleće korisničko ime.",
      rarity: "rare",
      renderData: { glow: "#A78BFA" },
      pointCost: 500,
    },
    {
      type: "avatar_decoration",
      name: "Zlatni okvir",
      description: "Zlatni prsten oko avatara.",
      rarity: "epic",
      renderData: { ring: "gold" },
      pointCost: 1200,
    },
    {
      type: "avatar_decoration",
      name: "Neon dekoracija",
      description: "Neonski okvir na profilu.",
      rarity: "legendary",
      renderData: { frame: "neon", glow: "#A78BFA" },
      pointCost: 3000,
    },
  ]);
  const [tshirt] = await db
    .insert(schema.merchItems)
    .values({
      name: "tikimiki majica",
      description: "Pamučna majica sa logom.",
      imageUrl: "/merch/tee.png",
      pointCost: 1500,
    })
    .returning();
  await db.insert(schema.merchVariants).values([
    { merchId: tshirt.merchId, label: "S", stock: 10 },
    { merchId: tshirt.merchId, label: "M", stock: 20 },
    { merchId: tshirt.merchId, label: "L", stock: 15 },
  ]);
  await db.insert(schema.merchItems).values({
    name: "tikimiki šolja",
    description: "Keramička šolja, 330ml.",
    imageUrl: "/merch/mug.png",
    pointCost: 800,
  });

  // ── Social: follows + friendships ──────────────────────────────────
  await db.insert(schema.follows).values([
    { followerId: mohammed, followeeId: andrej },
    { followerId: nenad, followeeId: andrej },
    { followerId: mara, followeeId: fenjer },
  ]);
  const [fa, fb] = ordered(andrej, mohammed);
  await db.insert(schema.friendships).values({
    userIdA: fa,
    userIdB: fb,
    requesterId: andrej,
    status: "accepted",
    respondedAt: ago(1000),
  });

  // ── Feed posts + comments + reactions ──────────────────────────────
  const postRows = await db
    .insert(schema.posts)
    .values([
      { userId: andrej, content: "Spremam se za ETF HackWeek! 🚀", createdAt: ago(240) },
      { userId: mohammed, content: "Tražim tim za frontend, javite se 👋", createdAt: ago(150) },
      {
        userId: fenjer,
        content: "Objavio sam novi ML starter repo, link u komentarima.",
        createdAt: ago(60),
      },
    ])
    .returning();

  await db.insert(schema.comments).values([
    { postId: postRows[0].postId, userId: mohammed, content: "Srećno! 💪", createdAt: ago(230) },
    { postId: postRows[0].postId, userId: nenad, content: "Vidimo se tamo!", createdAt: ago(220) },
    { postId: postRows[2].postId, userId: andrej, content: "Top, baci link!", createdAt: ago(50) },
  ]);

  await db.insert(schema.postReactions).values([
    { userId: mohammed, postId: postRows[0].postId, symbol: "❤" },
    { userId: nenad, postId: postRows[0].postId, symbol: "❤" },
    { userId: andrej, postId: postRows[2].postId, symbol: "❤" },
  ]);

  // ── Notifications (for andrej) ─────────────────────────────────────
  await db.insert(schema.notifications).values([
    {
      userId: andrej,
      type: "application_approved",
      title: "Prijava odobrena",
      body: "Tvoja prijava za ETF HackWeek 2026 je odobrena.",
      entityType: "hackathon",
      entityId: etf,
      createdAt: ago(2800),
      readAt: ago(2700),
    },
    {
      userId: andrej,
      type: "new_follower",
      title: "Novi pratilac",
      body: "@mohammed te sada prati.",
      entityType: "user",
      entityId: mohammed,
      createdAt: ago(120),
    },
    {
      userId: andrej,
      type: "badge_awarded",
      title: "Novi bedž",
      body: "Osvojio si bedž „Prvi hakaton“.",
      entityType: "badge",
      entityId: badgeRows[0].badgeId,
      createdAt: ago(90),
    },
    {
      userId: andrej,
      type: "friend_request_accepted",
      title: "Zahtev prihvaćen",
      body: "@mohammed je prihvatio tvoj zahtev za prijateljstvo.",
      entityType: "user",
      entityId: mohammed,
      createdAt: ago(30),
    },
  ]);

  // ── Reports (moderation queue) ─────────────────────────────────────
  await db.insert(schema.reports).values([
    {
      reporterId: nenad,
      targetType: "post",
      targetId: postRows[1].postId,
      reason: "Spam / reklama",
      status: "pending",
      createdAt: ago(45),
    },
  ]);

  // ── Team invitations + join requests ───────────────────────────────
  await db.insert(schema.teamInvitations).values({
    teamId: teamDigitalci.teamId,
    userId: fenjer,
    invitedBy: andrej,
    message: "Treba nam ML inženjer — javi se! 🤖",
  });
  await db.insert(schema.teamJoinRequests).values({
    teamId: teamNullptr.teamId,
    userId: mara,
    message: "Radim dizajn i UX, volela bih da se priključim.",
  });

  console.log("✅ Seed done.");
  console.log("   Login with any of: admin@tikimiki.dev / andrej@tikimiki.dev / org@tikimiki.dev");
  console.log("   Password: password123");
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
