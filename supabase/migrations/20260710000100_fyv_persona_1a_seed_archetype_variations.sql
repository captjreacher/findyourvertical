-- ============================================================================
-- FYV-PERSONA-1A — Seed archetype variation library
-- ============================================================================
-- Seeds meaningfully differentiated creative variations for every real
-- assessment archetype in src/types/creator.ts CREATOR_ARCHETYPES, EXCEPT the
-- neutral 'Other' sentinel (which represents "no archetype identified" and has
-- no creative direction to portray).
--
-- Each archetype gets 6-10 variations that represent distinct creative
-- directions (setting, energy, dynamic) rather than superficial renames, so a
-- creator whose primary/secondary/third archetype is any of these can always
-- satisfy the selection minimums (>=3 / >=2 / >=1).
--
-- Idempotent: ON CONFLICT (archetype, name) DO NOTHING, so re-running is safe
-- and later hand-edits to individual rows are preserved.
-- ============================================================================

begin;

insert into public.archetype_variations (archetype, name, description, display_order) values
-- ── Girl Next Door ──────────────────────────────────────────────────────────
('Girl Next Door', 'Gamer Girl Next Door', 'The easygoing girl from down the street who unwinds with controllers, cosy streams, and late-night chats.', 1),
('Girl Next Door', 'College Girl Next Door', 'Fresh dorm-life energy: study breaks, campus stories, and relatable everyday charm.', 2),
('Girl Next Door', 'Summer Romance Girl Next Door', 'Sun-warmed and flirty, like a season-long crush by the beach.', 3),
('Girl Next Door', 'Voyeur / Secret Glimpse Girl Next Door', 'The feeling of quietly catching private everyday moments through the window next door.', 4),
('Girl Next Door', 'Newly Single Girl Next Door', 'Rediscovering herself and her confidence after a breakup, open and a little adventurous.', 5),
('Girl Next Door', 'Shy Girl Discovering Her Confidence', 'Softly spoken and modest, slowly warming up and coming out of her shell.', 6),
('Girl Next Door', 'Neighbour You Secretly Fancy', 'The friendly girl across the hall you cannot stop thinking about.', 7),
('Girl Next Door', 'Best Friend Who Wants Something More', 'Familiar and trusted, hinting that friendship could become something else.', 8),
('Girl Next Door', 'Small-Town Girl in the Big City', 'Wholesome roots meeting new big-city freedom and temptation.', 9),
('Girl Next Door', 'Innocent-Looking but Adventurous', 'Sweet on the surface, surprisingly bold once she trusts you.', 10),
-- ── Hot Teacher ─────────────────────────────────────────────────────────────
('Hot Teacher', 'After-Class Tutor', 'Patient one-on-one attention that lingers a little longer than the lesson.', 1),
('Hot Teacher', 'Strict Substitute', 'New in the building, setting firm rules with a knowing smile.', 2),
('Hot Teacher', 'Favourite Professor', 'Composed campus authority who makes office hours feel personal.', 3),
('Hot Teacher', 'Detention Supervisor', 'Keeping you back after hours for some extra guidance.', 4),
('Hot Teacher', 'Study-Abroad Language Teacher', 'Worldly and warm, teaching far more than vocabulary.', 5),
('Hot Teacher', 'Night-School Instructor', 'Grown-up classroom, later hours, looser rules.', 6),
('Hot Teacher', 'Encouraging Mentor', 'Believes in you, rewards effort, and keeps you wanting to impress her.', 7),
('Hot Teacher', 'Exam-Week Private Coach', 'Intense, focused sessions when the pressure is on.', 8),
-- ── Naughty Librarian ───────────────────────────────────────────────────────
('Naughty Librarian', 'After-Hours Archivist', 'Alone in the stacks once the doors are locked.', 1),
('Naughty Librarian', 'Buttoned-Up Bookworm', 'Glasses on, hair up, hiding a bolder imagination.', 2),
('Naughty Librarian', 'Rare-Collection Curator', 'A quiet expert guarding something worth unwrapping slowly.', 3),
('Naughty Librarian', 'Reading-Room Whisper', 'Soft voice, slow reveals, tension built page by page.', 4),
('Naughty Librarian', 'Prim Records Clerk', 'Orderly and proper until exactly the right person asks.', 5),
('Naughty Librarian', 'Late-Return Enforcer', 'Playfully strict about the rules she secretly loves breaking.', 6),
('Naughty Librarian', 'Hidden-Diary Keeper', 'Reserved by day, candid in the pages no one is meant to read.', 7),
-- ── Nurse ───────────────────────────────────────────────────────────────────
('Nurse', 'Night-Shift Carer', 'A calm presence when the ward is quiet and it is just the two of you.', 1),
('Nurse', 'Private Home Nurse', 'Devoted one-on-one attention and gentle bedside warmth.', 2),
('Nurse', 'Recovery Companion', 'Checking in, patching you up, making sure you feel looked after.', 3),
('Nurse', 'Reassuring Triage Nurse', 'Steady hands and a soothing voice when you need calming.', 4),
('Nurse', 'Caring Physio', 'Hands-on and attentive, focused on making you feel better.', 5),
('Nurse', 'Sweet Student Nurse', 'Eager and warm, a little nervous in the best way.', 6),
('Nurse', 'Comfort-First Matron', 'Warm authority who tends to every need.', 7),
-- ── Doctor ──────────────────────────────────────────────────────────────────
('Doctor', 'Private Practice Specialist', 'Polished, exclusive, and completely focused on you.', 1),
('Doctor', 'Confident Surgeon', 'Precise and in control, unshakeable under pressure.', 2),
('Doctor', 'After-Hours House Call', 'Discreet premium attention on your schedule.', 3),
('Doctor', 'Wellness Clinic Director', 'An aspirational expert curating a high-end experience.', 4),
('Doctor', 'Cool-Headed ER Doctor', 'Calm command when everything else is chaos.', 5),
('Doctor', 'Concierge Physician', 'Bespoke care for a very short client list.', 6),
('Doctor', 'Brilliant Research Doctor', 'Composed, accomplished, and quietly magnetic.', 7),
-- ── Corporate Rebel ─────────────────────────────────────────────────────────
('Corporate Rebel', 'CEO After Dark', 'Boardroom control loosening once the office empties.', 1),
('Corporate Rebel', 'Buttoned-Up Executive Unravelling', 'Tailored by day, liberated by night.', 2),
('Corporate Rebel', 'Power-Suit Double Life', 'A sharp professional with a secret alter ego.', 3),
('Corporate Rebel', 'Weekend Escape From the Corner Office', 'Trading spreadsheets for freedom.', 4),
('Corporate Rebel', 'Ambitious Associate Breaking the Rules', 'Climbing the ladder and colouring outside the lines.', 5),
('Corporate Rebel', 'Ice-Queen Boss Melting', 'Cold command giving way to something warmer.', 6),
('Corporate Rebel', 'Off-the-Clock Rebellion', 'The version of her the office never sees.', 7),
-- ── Fitness Goddess ─────────────────────────────────────────────────────────
('Fitness Goddess', 'Home-Gym Trainer', 'Personal sessions, motivation, and sweat in your space.', 1),
('Fitness Goddess', 'Yoga & Flexibility Muse', 'Graceful control, calm strength, and flowing movement.', 2),
('Fitness Goddess', 'Beach-Body Athlete', 'Sun, sand, and peak-condition confidence.', 3),
('Fitness Goddess', 'Post-Workout Cooldown', 'The relaxed, glowing aftermath of a hard session.', 4),
('Fitness Goddess', 'Competitive Bodybuilder', 'Sculpted discipline and stage-ready intensity.', 5),
('Fitness Goddess', 'Outdoor Runner', 'Energetic, outdoorsy, endorphin-fuelled charm.', 6),
('Fitness Goddess', 'Pilates Perfectionist', 'Precise, poised, and quietly demanding.', 7),
('Fitness Goddess', 'Personal Coach Who Pushes You', 'Encouraging and firm, invested in your results.', 8),
-- ── Dominatrix ──────────────────────────────────────────────────────────────
('Dominatrix', 'Elegant Findomme', 'Refined control centred on tribute and devotion.', 1),
('Dominatrix', 'Strict Disciplinarian', 'Rules, structure, and consequences delivered coolly.', 2),
('Dominatrix', 'Latex Mistress', 'A commanding presence with a sharp, glossy aesthetic.', 3),
('Dominatrix', 'Ritual Worship Mistress', 'Focused, ceremonial, and precise in her demands.', 4),
('Dominatrix', 'Sensual Dominant', 'Slow and controlling, more velvet than steel.', 5),
('Dominatrix', 'Task-Setting Mistress', 'Assignments, protocols, and earned approval.', 6),
('Dominatrix', 'Ice-Cold Commander', 'Detached authority that makes obedience the prize.', 7),
-- ── Brat ────────────────────────────────────────────────────────────────────
('Brat', 'Spoiled Princess', 'Demanding and teasing, used to getting her way.', 1),
('Brat', 'Bratty Gamer', 'Trash-talking, competitive, impossible to ignore.', 2),
('Brat', 'Attention-Seeking Menace', 'Pushing buttons just to keep your eyes on her.', 3),
('Brat', 'Defiant Sub-in-Training', 'Talks back, but secretly wants to be reined in.', 4),
('Brat', 'High-Maintenance Girlfriend', 'High-maintenance charm with a mischievous streak.', 5),
('Brat', 'Playful Troublemaker', 'All cheeky dares and daring you back.', 6),
('Brat', 'Sarcastic Sweetheart', 'Sharp tongue, soft centre.', 7),
-- ── Submissive ──────────────────────────────────────────────────────────────
('Submissive', 'Devoted Pet', 'Eager to please and happiest when guided.', 1),
('Submissive', 'Shy Sub Discovering Herself', 'Nervous and curious, slowly surrendering.', 2),
('Submissive', 'Attentive Housemate', 'Service-minded and always ready to help.', 3),
('Submissive', 'Kneeling Worshipper', 'Reverent and soft, focused entirely on you.', 4),
('Submissive', 'Rope-and-Ribbon Sub', 'Enjoys being bound, presented, and praised.', 5),
('Submissive', 'Good Girl Seeking Approval', 'Motivated by praise and gentle correction.', 6),
('Submissive', 'Service-First Companion', 'Anticipates needs and lives to fulfil them.', 7),
-- ── Trophy Wife ─────────────────────────────────────────────────────────────
('Trophy Wife', 'Bored Housewife Next Door', 'Beautiful and restless, looking for a little excitement.', 1),
('Trophy Wife', 'Kept Woman in the Mansion', 'Pampered, styled, and thoroughly indulged.', 2),
('Trophy Wife', 'Domestic Goddess', 'Aprons, cocktails, and impossibly glamorous chores.', 3),
('Trophy Wife', 'Lonely Luxury Wife', 'Surrounded by comfort and craving attention.', 4),
('Trophy Wife', 'Country-Club Sweetheart', 'Tennis whites, champagne, and easy privilege.', 5),
('Trophy Wife', 'Newlywed Fantasy', 'Fresh vows and honeymoon indulgence.', 6),
('Trophy Wife', 'Picture-Perfect With a Secret', 'Flawlessly domestic with a knowing wink.', 7),
-- ── Rich Girl ───────────────────────────────────────────────────────────────
('Rich Girl', 'Spoiled Heiress', 'Trust-fund confidence and unattainable glamour.', 1),
('Rich Girl', 'Monaco Yacht Girl', 'Sun-drenched wealth out on open water.', 2),
('Rich Girl', 'Designer-Obsessed Socialite', 'Runway wardrobe and VIP everything.', 3),
('Rich Girl', 'Old-Money Elegance', 'Understated, exclusive, and effortlessly refined.', 4),
('Rich Girl', 'Private-Jet Jetsetter', 'City to city, always first class.', 5),
('Rich Girl', 'Penthouse Princess', 'Skyline views and velvet-rope access.', 6),
('Rich Girl', 'Endlessly Indulged Shopper', 'Playfully spoiled and forever browsing the boutiques.', 7),
-- ── Luxury Muse ─────────────────────────────────────────────────────────────
('Luxury Muse', 'Editorial Cover Girl', 'Magazine-polished poise and quiet drama.', 1),
('Luxury Muse', 'Runway Model Off-Duty', 'Effortless elegance between the shows.', 2),
('Luxury Muse', 'Fine-Art Nude Muse', 'Tasteful, sculptural, and gallery-worthy.', 3),
('Luxury Muse', 'Parisian Fashion Icon', 'Chic, aloof, and impossibly stylish.', 4),
('Luxury Muse', 'Couture Fitting Room', 'Intimate glimpses behind the atelier curtain.', 5),
('Luxury Muse', 'Black-and-White Studio Muse', 'Timeless, minimal, and cinematic.', 6),
('Luxury Muse', 'Perfume-Campaign Face', 'Sultry, aspirational, and brand-flawless.', 7),
-- ── Alternative / Tattooed ──────────────────────────────────────────────────
('Alternative / Tattooed', 'Ink-Covered Rebel', 'Bold sleeves and an unapologetic attitude.', 1),
('Alternative / Tattooed', 'Goth Girlfriend', 'Dark aesthetic, soft heart, moody charm.', 2),
('Alternative / Tattooed', 'Punk Rock Muse', 'Loud, fearless, and effortlessly cool.', 3),
('Alternative / Tattooed', 'Alt Model in the Studio', 'Piercings, art, and edgy shoots.', 4),
('Alternative / Tattooed', 'Metalhead Sweetheart', 'Band tees, mosh energy, loyal to the scene.', 5),
('Alternative / Tattooed', 'Pastel-Goth Cutie', 'Soft colours meeting dark edges.', 6),
('Alternative / Tattooed', 'Retro Alt Pin-Up', 'Vintage-alt glamour with tattoos and attitude.', 7),
-- ── Gamer Girl ──────────────────────────────────────────────────────────────
('Gamer Girl', 'Cosy Stream Companion', 'Late-night gaming, blankets, and chilled chat.', 1),
('Gamer Girl', 'Competitive Esports Rival', 'Skilled and cocky, fun to beat or lose to.', 2),
('Gamer Girl', 'Retro Arcade Sweetheart', 'Neon nostalgia and playful high scores.', 3),
('Gamer Girl', 'Twitch Girlfriend Experience', 'Feels like gaming with someone who is into you.', 4),
('Gamer Girl', 'Cosplay-Gamer Crossover', 'Dressing as the characters she loves to play.', 5),
('Gamer Girl', 'MMO Guildmate Crush', 'The teammate you always want in your party.', 6),
('Gamer Girl', 'Couch Co-op Girlfriend', 'Split-screen closeness and playful competition.', 7),
-- ── Cosplayer ───────────────────────────────────────────────────────────────
('Cosplayer', 'Anime Heroine', 'Screen-accurate builds and character-perfect energy.', 1),
('Cosplayer', 'Video-Game Vixen', 'Iconic game characters brought to life.', 2),
('Cosplayer', 'Comic-Con Star', 'Convention-floor glamour and fandom charisma.', 3),
('Cosplayer', 'Fantasy Elf Enchantress', 'Ethereal costumes and otherworldly allure.', 4),
('Cosplayer', 'Hero-and-Villain Switch', 'Flipping between heroic and villainous personas.', 5),
('Cosplayer', 'Magical-Girl Transformation', 'Sweet, sparkly, transformation-arc storytelling.', 6),
('Cosplayer', 'Sci-Fi Bounty Hunter', 'Armoured, dangerous, and in command.', 7),
-- ── Spiritual Goddess ───────────────────────────────────────────────────────
('Spiritual Goddess', 'Tantric Priestess', 'Slow, intentional, sensual spirituality.', 1),
('Spiritual Goddess', 'Moonlit Ritual Muse', 'Candles, incense, and mystic calm.', 2),
('Spiritual Goddess', 'Yoga Retreat Guide', 'Serene, flexible, and grounding.', 3),
('Spiritual Goddess', 'Bohemian Free Spirit', 'Flowing fabrics and untethered warmth.', 4),
('Spiritual Goddess', 'Crystal-Healing Enchantress', 'Gentle mysticism and aspirational calm.', 5),
('Spiritual Goddess', 'Forest Nymph', 'Ethereal, natural, and dreamlike.', 6),
('Spiritual Goddess', 'Sacred-Feminine Muse', 'Reverent, affirming, and quietly powerful.', 7),
-- ── MILF ────────────────────────────────────────────────────────────────────
('MILF', 'Confident Cougar', 'Knows exactly what she wants and how to get it.', 1),
('MILF', 'Sultry Stepmom Fantasy', 'Warm authority with a forbidden edge.', 2),
('MILF', 'Best Friend''s Hot Mom', 'Familiar and attentive, impossible to ignore.', 3),
('MILF', 'Wine-Night Divorcee', 'Relaxed and flirty, rediscovering the fun.', 4),
('MILF', 'Approachable Neighbour', 'Down-to-earth everyday maturity.', 5),
('MILF', 'Elegant Older Woman', 'Refined, self-assured, and magnetic.', 6),
('MILF', 'Experienced Mentor', 'Patient and guiding, quietly seductive.', 7),
-- ── Single Mom ──────────────────────────────────────────────────────────────
('Single Mom', 'Girl-Next-Door Single Mom', 'Down-to-earth and warm, quietly resilient.', 1),
('Single Mom', 'Naptime Content Creator', 'Candid moments stolen in the quiet hours.', 2),
('Single Mom', 'Confident Comeback', 'Reclaiming herself and her spark.', 3),
('Single Mom', 'Fun Weekend Mom', 'Relaxed and playful, making the most of free time.', 4),
('Single Mom', 'Relatable Everyday Hero', 'Honest realness that fans root for.', 5),
('Single Mom', 'Late-Night Chats After Bedtime', 'Intimate, unguarded, one-on-one.', 6),
('Single Mom', 'Glow-Up Journey', 'Rediscovering confidence step by step.', 7),
-- ── College Girl ────────────────────────────────────────────────────────────
('College Girl', 'Sorority Sweetheart', 'Social, spirited, and effortlessly fun.', 1),
('College Girl', 'Dorm-Room Streamer', 'Casual late-night study-break energy.', 2),
('College Girl', 'Spring-Break Party Girl', 'Sun, freedom, and holiday mischief.', 3),
('College Girl', 'Library Study Buddy', 'Focused by day, flirty by night.', 4),
('College Girl', 'Campus Cheerleader', 'Bubbly, energetic, school-spirit charm.', 5),
('College Girl', 'Freshman Discovering Freedom', 'Wide-eyed, curious, and adventurous.', 6),
('College Girl', 'Art-Major Free Spirit', 'Creative, expressive, and a little bohemian.', 7),
-- ── Party Girl ──────────────────────────────────────────────────────────────
('Party Girl', 'Festival Wild Child', 'Glitter, music, and open-air abandon.', 1),
('Party Girl', 'VIP Club Regular', 'Bottle service and dance-floor magnetism.', 2),
('Party Girl', 'Beach-Party Bombshell', 'Sun-soaked, carefree, and flirty.', 3),
('Party Girl', 'After-Party Host', 'The night never ends where she is.', 4),
('Party Girl', 'Vegas Weekend', 'High-stakes fun and neon nights.', 5),
('Party Girl', 'Rooftop-Cocktail Socialite', 'Skyline views and easy charm.', 6),
('Party Girl', 'Spontaneous Adventure Seeker', 'Always up for whatever comes next.', 7),
-- ── Boss Babe ───────────────────────────────────────────────────────────────
('Boss Babe', 'Startup Founder', 'Ambitious and sharp, building an empire.', 1),
('Boss Babe', 'Influencer Mogul', 'Brand-savvy and effortlessly aspirational.', 2),
('Boss Babe', 'Real-Estate Power Player', 'A confident closer with luxury taste.', 3),
('Boss Babe', 'Fitness-Brand Owner', 'Disciplined hustle meeting an aspirational body.', 4),
('Boss Babe', 'Boutique Fashion Boss', 'Stylish, decisive, and in command.', 5),
('Boss Babe', 'Money-Minded Mentor', 'Motivational, driven, and magnetic.', 6),
('Boss Babe', 'Self-Made Luxury', 'Earned wealth worn with confidence.', 7),
-- ── Country Girl ────────────────────────────────────────────────────────────
('Country Girl', 'Farmer''s Daughter', 'Wholesome and hardworking, naturally pretty.', 1),
('Country Girl', 'Rodeo Sweetheart', 'Boots, denim, and easy small-town charm.', 2),
('Country Girl', 'Lakeside Cabin Girl', 'Relaxed, outdoorsy, and warm.', 3),
('Country Girl', 'Southern Belle', 'Sweet manners with a playful streak.', 4),
('Country Girl', 'Ranch-Hand Cutie', 'Sun-kissed, capable, and down-to-earth.', 5),
('Country Girl', 'Bonfire-Night Girlfriend', 'Campfires, flannel, and starry skies.', 6),
('Country Girl', 'Barn-Dance Sweetheart', 'Wholesome fun and country warmth.', 7),
-- ── Bimbo ───────────────────────────────────────────────────────────────────
('Bimbo', 'Doll-Fantasy Bombshell', 'Pink, polished, and playfully perfect.', 1),
('Bimbo', 'Glam Airhead Sweetheart', 'Bubbly and exaggerated, endlessly fun.', 2),
('Bimbo', 'High-Gloss Bombshell', 'Bold curves and full-gloss glamour.', 3),
('Bimbo', 'Valley-Girl Charmer', 'A playful accent and shopping-spree energy.', 4),
('Bimbo', 'Hyper-Feminine Doll', 'Lashes, heels, and full-glam commitment.', 5),
('Bimbo', 'Ditzy-but-Devoted', 'Sweet and silly, completely into you.', 6),
('Bimbo', 'Camera-Ready Baddie', 'Filtered, fierce, and always camera-ready.', 7),
-- ── Soft Girlfriend Experience ──────────────────────────────────────────────
('Soft Girlfriend Experience', 'Long-Distance Girlfriend', 'Good-morning texts and bedtime calls.', 1),
('Soft Girlfriend Experience', 'Cuddle-Weather Companion', 'Cosy nights in and gentle closeness.', 2),
('Soft Girlfriend Experience', 'Supportive Sweetheart', 'Always listening, always in your corner.', 3),
('Soft Girlfriend Experience', 'Morning-After Girlfriend', 'Warm, unhurried, lived-in intimacy.', 4),
('Soft Girlfriend Experience', 'Date-Night Partner', 'Attentive, romantic, and fully present.', 5),
('Soft Girlfriend Experience', 'Comfort-Text Confidante', 'Soft check-ins and genuine care.', 6),
('Soft Girlfriend Experience', 'Homebody Girlfriend', 'Movies, takeout, and easy affection.', 7),
-- ── High-Class Escort Fantasy ───────────────────────────────────────────────
('High-Class Escort Fantasy', 'Dinner-Date Companion', 'Refined conversation and effortless glamour.', 1),
('High-Class Escort Fantasy', 'Weekend-Away Companion', 'Discreet, exclusive, and undivided attention.', 2),
('High-Class Escort Fantasy', 'Black-Tie Gala Partner', 'Poised on your arm at the finest events.', 3),
('High-Class Escort Fantasy', 'Penthouse Rendezvous', 'Private, premium, and unhurried.', 4),
('High-Class Escort Fantasy', 'First-Class Travel Companion', 'First-class escapes with a flawless partner.', 5),
('High-Class Escort Fantasy', 'VIP Concierge Fantasy', 'Every detail curated, every wish anticipated.', 6),
('High-Class Escort Fantasy', 'Exclusive Little-Black-Book Girl', 'Reserved for a very select few.', 7),
-- ── Seductress ──────────────────────────────────────────────────────────────
('Seductress', 'Femme Fatale', 'Dangerous charm and irresistible mystery.', 1),
('Seductress', 'Slow-Tease Enchantress', 'Anticipation built one moment at a time.', 2),
('Seductress', 'Lingerie Muse', 'Confident, classic, and beautifully composed.', 3),
('Seductress', 'Whispered-Invitation Siren', 'A voice and a look you cannot resist.', 4),
('Seductress', 'Old-Hollywood Bombshell', 'Timeless glamour and smouldering poise.', 5),
('Seductress', 'Midnight Temptress', 'Candlelit confidence after dark.', 6),
('Seductress', 'Stranger Across the Room', 'The magnetic pull of a single knowing glance.', 7),
-- ── Artist / Creative Muse ──────────────────────────────────────────────────
('Artist / Creative Muse', 'Painter in the Studio', 'Paint-smeared and absorbed, expressive and free.', 1),
('Artist / Creative Muse', 'Bohemian Poet', 'Dreamy and romantic, quietly intense.', 2),
('Artist / Creative Muse', 'Indie Musician', 'Guitar, lyrics, and late-night creative energy.', 3),
('Artist / Creative Muse', 'Photographer''s Muse', 'Comfortable and captivating in front of the lens.', 4),
('Artist / Creative Muse', 'Dancer''s Grace', 'Movement, discipline, and fluid expression.', 5),
('Artist / Creative Muse', 'Tattoo-Artist Creative', 'Inked, artistic, and effortlessly cool.', 6),
('Artist / Creative Muse', 'Sculptor''s Model', 'Still, sculptural, and gallery-worthy.', 7)
on conflict (archetype, name) do nothing;

commit;
