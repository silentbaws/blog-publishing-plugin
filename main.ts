import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, request, Setting, TAbstractFile, TFile } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
    apiKey: string;
    postPath: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    apiKey: '',
    postPath: ''
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        await this.loadSettings();

        // This adds an editor command that can perform some operation on the current editor instance
        this.addCommand({
            id: 'sample-editor-command',
            name: 'Sample editor command',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                console.log(editor.getSelection());
                editor.replaceSelection('Sample Editor Command');
            }
        });

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new SampleSettingTab(this.app, this));

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
              menu.addItem((item) => {
                item
                  .setTitle('Upload as Blog Post')
                  .setIcon('cloud-upload')
                  .onClick(async () => {
                    this.startUploadBlogPost(file);
                  });
              });
            })
          );
    }

    async startUploadBlogPost(abstractFile: TAbstractFile) {
        const file = this.app.vault.getFileByPath(abstractFile.path);
        if (file == null) {
            new Notice("Error: cannot upload a folder to blog");
            return;
        }

        
        this.getMetaDataForUpload(file);
    }

    async getMetaDataForUpload(file: TFile) {
        const data = await this.app.vault.read(file);
        const propStartIdx = data.indexOf('---\n')
        const propEndIdx = data.indexOf('---\n', 3);

        const metadata = this.app.metadataCache.getFileCache(file);

        if (propStartIdx == 0 && propEndIdx != -1 && metadata !== null && metadata.frontmatter) {
            const title = metadata.frontmatter['blog_title'];
            const id = metadata.frontmatter['blog_id'];
            const publicPost = metadata.frontmatter['public'];
            const description = metadata.frontmatter['description'];

            const attachedFiles = metadata.embeds?.map(embed => {
                const embedFile = this.app.vault.getFileByPath(embed.link);
                if (embedFile != null) {
                    return {
                        fileData: this.app.vault.readBinary(embedFile),
                        fileName: embed.link
                    }
                }
            });

            let validationPassing = true;
            if (title == undefined) {
                validationPassing = false;
                new Notice("Must set the blog_title property for post")
            }
            if (id == undefined) {
                validationPassing = false;
                new Notice("Must set the blog_id property for post")
            }
            if (publicPost == undefined) {
                validationPassing = false;
                new Notice("Must set the public property for post")
            }
            if (description == undefined) {
                validationPassing = false;
                new Notice("Must set a description property for post")
            }

            if (validationPassing) {
                attachedFiles?.forEach(async file => {
                    if (!file) return;
                    const fileBytes = await file.fileData;
                    
                    request({
                        url: this.settings.postPath  + "attachFile",
                        body: fileBytes,
                        headers: {
                            "blog_title": title,
                            "blog_id": id,
                            "api_key": this.settings.apiKey,
                            "image_name": file.fileName
                        },
                        method: "POST",
                    }).then(r => {
                        new Notice(r);
                    }).catch(e => {
                        new Notice(e);
                    });
                });

                request({
                    url: this.settings.postPath + "upload",
                    body: data.substring(propEndIdx + 4),
                    headers: {
                        "blog_title": title,
                        "blog_id": id,
                        "is_public": JSON.stringify(publicPost == "true"),
                        "api_key": this.settings.apiKey,
                        "description": description
                    },
                    method: "POST",
                }).then(r => {
                    new Notice(r);
                }).catch(e => {
                    new Notice(e);
                });
            }
        } else {
            new Notice ("Failed upload: Properties or cache data was unreadable")
        }
    }

    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('The API key for publishing blog posts')
            .addText(text => text
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));
        new Setting(containerEl)
            .setName('API Path')
            .setDesc('The Path for posting blogs')
            .addText(text => text
                .setValue(this.plugin.settings.postPath)
                .onChange(async (value) => {
                    this.plugin.settings.postPath = value;
                    await this.plugin.saveSettings();
                }));
    }
}
