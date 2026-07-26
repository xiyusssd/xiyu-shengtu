mod commands;
mod config;
mod history;
mod providers;

use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

fn build_menu<R: tauri::Runtime, M: tauri::Manager<R>>(handle: &M) -> tauri::Result<tauri::menu::Menu<R>> {
    // App 主菜单（macOS 显示为「xiyu-shengtu」）
    let about_metadata = AboutMetadata {
        name: Some("xiyu-shengtu".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        short_version: Some(env!("CARGO_PKG_VERSION").into()),
        authors: Some(vec!["xiyu".into()]),
        comments: Some("极简批量生图工作台".into()),
        copyright: Some("© 2026 xiyu".into()),
        license: Some("Personal".into()),
        website: None,
        website_label: None,
        credits: None,
        icon: None,
    };

    let app_menu = SubmenuBuilder::new(handle, "xiyu-shengtu")
        .about(Some(about_metadata))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let open_config = MenuItemBuilder::new("打开配置目录")
        .id("open_config")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(handle)?;
    let go_gallery = MenuItemBuilder::new("查看图库")
        .id("go_gallery")
        .accelerator("CmdOrCtrl+G")
        .build(handle)?;
    let file_menu = SubmenuBuilder::new(handle, "文件")
        .item(&open_config)
        .item(&go_gallery)
        .separator()
        .close_window()
        .build()?;

    let edit_menu = SubmenuBuilder::new(handle, "编辑")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view_menu = SubmenuBuilder::new(handle, "视图")
        .fullscreen()
        .build()?;

    let window_menu = SubmenuBuilder::new(handle, "窗口")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    MenuBuilder::new(handle)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "open_config" => {
                    let _ = commands::open_config_folder();
                }
                "go_gallery" => {
                    // 让前端切到 Gallery tab
                    let _ = app.emit("menu:navigate", "gallery");
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_config,
            commands::create_provider,
            commands::update_provider,
            commands::delete_provider,
            commands::activate_provider,
            commands::test_provider,
            commands::generate_batch,
            commands::list_profiles,
            commands::create_profile,
            commands::switch_profile,
            commands::rename_profile,
            commands::delete_profile,
            commands::get_preferences,
            commands::set_preferences,
            commands::export_providers,
            commands::import_providers,
            commands::list_templates,
            commands::create_template,
            commands::update_template,
            commands::delete_template,
            commands::save_history_item,
            commands::list_history,
            commands::delete_history_item,
            commands::clear_history,
            commands::read_history_image,
            commands::open_config_folder,
            commands::translate_prompt,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
