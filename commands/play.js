const { play } = require("../include/play");
const ytdl = require("ytdl-core");
const YouTubeAPI = require("simple-youtube-api");
const scdl = require("soundcloud-downloader");

let YOUTUBE_API_KEY, SOUNDCLOUD_CLIENT_ID;
try {
  const config = require("../config.json");
  YOUTUBE_API_KEY = config.YOUTUBE_API_KEY;
  SOUNDCLOUD_CLIENT_ID = config.SOUNDCLOUD_CLIENT_ID;
} catch (error) {
  YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  SOUNDCLOUD_CLIENT_ID = process.env.SOUNDCLOUD_CLIENT_ID;
}
const youtube = new YouTubeAPI(YOUTUBE_API_KEY);

module.exports = {
  name: "play",
  cooldown: 3,
  aliases: ["p"],
  description: "Plays audio from YouTube or Soundcloud",
  async run(client, message, args) {
    const { channel } = message.member.voice;

    const serverQueue = message.client.queue.get(message.guild.id);
    if (!channel) return message.channel.send({embed: { description: "You need to join a voice channel first!", color: "RED"}}).catch(console.error);
    if (serverQueue && channel !== message.guild.me.voice.channel)
      return message.channel.send(`You must be in the same channel as ${message.client.user}`).catch(console.error);

    if (!args.length)
      return message
        .channel.send({embed: {
          title: `v.play ▶️ YouTube URL | 🎦 Video Name`,
          color: "BLUE"}})
        .catch(console.error);

    const permissions = channel.permissionsFor(message.client.user);
    if (!permissions.has("CONNECT"))
      return message.channel.send({embed: { description: ":x: Cannot connect to voice channel, missing permissions", color: "BLUE"}});
    if (!permissions.has("SPEAK"))
      return message.channel.send({embed: { description: ":x: I cannot speak in this voice channel, make sure I have the proper permissions!", color: "RED"}});

    const search = args.join(" ");
    const videoPattern = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.?be)\/.+$/gi;
    const playlistPattern = /^.*(list=)([^#\&\?]*).*/gi;
    const scRegex = /^https?:\/\/(soundcloud\.com)\/(.*)$/;
    const url = args[0];
    const urlValid = videoPattern.test(args[0]);

    // Start the playlist if playlist url was provided
    if (!videoPattern.test(args[0]) && playlistPattern.test(args[0])) {
      return message.client.commands.get("playlist").run(message, args);
    } else if (scdl.isValidUrl(url) && url.includes("/sets/")) {
      return message.client.commands.get("playlist").run(message, args);
    }

    const queueConstruct = {
      textChannel: message.channel,
      channel,
      connection: null,
      songs: [],
      loop: false,
      volume: 100,
      playing: true
    };

    let songInfo = null;
    let song = null;

    if (urlValid) {
      try {
        songInfo = await ytdl.getInfo(url);
        song = {
          title: songInfo.videoDetails.title,
          url: songInfo.videoDetails.video_url,
          duration: songInfo.videoDetails.lengthSeconds,
          id: songInfo.videoDetails.videoId
        };
      } catch (error) {
        console.error(error);
        return message.channel.send(error.message).catch(console.error);
      }
    } else if (scRegex.test(url)) {
      try {
        const trackInfo = await scdl.getInfo(url, SOUNDCLOUD_CLIENT_ID);
        song = {
          title: trackInfo.title,
          url: trackInfo.permalink_url,
          duration: Math.ceil(trackInfo.duration / 1000)
        };
      } catch (error) {
        if (error.statusCode === 404)
          return message.channel.send("Could not find that Soundcloud track.").catch(console.error);
        return message.channel.send("There was an error playing that Soundcloud track.").catch(console.error);
      }
    } else {
      try {
        const results = await youtube.searchVideos(search, 1);
        songInfo = await ytdl.getInfo(results[0].url);
        song = {
          title: songInfo.videoDetails.title,
          url: songInfo.videoDetails.video_url,
          duration: songInfo.videoDetails.lengthSeconds,
          id: songInfo.videoDetails.videoId
        };
      } catch (error) {
        console.error(error);
        return message.channel.send("No video was found with a matching title").catch(console.error);
      }
    }

    if (serverQueue) {
      serverQueue.songs.push(song);
      return serverQueue.textChannel
        .send({embed: {
          title: `➕ Added To Queue`,
          description: `<:check:718313268577566721> **${song.title}** has been added to the queue by ${message.author}`,
          color: "BLUE"}}).then(m => m.delete({timeout: 5000}))
        .catch(console.error);
    }

    queueConstruct.songs.push(song);
    message.client.queue.set(message.guild.id, queueConstruct);

    try {
      queueConstruct.connection = await channel.join();
      await queueConstruct.connection.voice.setSelfDeaf(true);
      play(queueConstruct.songs[0], message);
    } catch (error) {
      console.error(error);
      message.client.queue.delete(message.guild.id);
      await channel.leave();
      return message.channel.send(`Could not join the channel: ${error}`).catch(console.error);
    }
  }
};